/*
 * RAG EVALUATION RUNNER + CLI (ledger #18 — 2026-08-09)
 * Smallest useful evaluation: for each labeled case, rank the synthetic
 * corpus with a deterministic in-memory LEXICAL baseline (token overlap
 * with stopword filtering and a trivial plural stem), then score with the
 * pure metrics (Recall@K, MRR) and print a concise report.
 *
 * This is NOT the production retriever: no database, no AI provider, and
 * zero changes to the production RAG pipeline. The command exits non-zero
 * only on harness errors (bad dataset, unexpected failure) — it does NOT
 * enforce benchmark-score thresholds.
 */

import { EVAL_CASES, EVAL_CORPUS, CorpusChunk, EvaluationCase } from './dataset';
import {
  evaluateCases,
  EvaluationReport,
  normalizeKValues,
  RagEvaluationError,
  RankedCaseInput,
} from './metrics';
import { Retriever } from './retrievers/retriever.interface';

/** Small deterministic English stopword list. */
const STOPWORDS: ReadonlySet<string> = new Set([
  'a', 'an', 'and', 'any', 'are', 'as', 'at', 'be', 'by', 'can', 'could',
  'do', 'does', 'for', 'from', 'get', 'gets', 'how', 'i', 'in', 'into',
  'is', 'it', 'its', 'me', 'my', 'of', 'on', 'or', 'should', 'so', 'that',
  'the', 'their', 'them', 'they', 'to', 'up', 'us', 'we', 'what', 'when',
  'where', 'which', 'who', 'why', 'with', 'would', 'you', 'your',
]);

/** Trivial plural stem ("tasks" -> "task"); deterministic. */
const stem = (token: string): string =>
  token.length > 3 && token.endsWith('s') ? token.slice(0, -1) : token;

/** Deterministic tokenization: lowercase, non-alphanumerics become spaces. */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((t) => t.length > 0 && !STOPWORDS.has(t));
}

/**
 * Deterministic lexical ranking: token-overlap score with mild length
 * normalization; stable ordering (score desc, then corpus order).
 */
export function rankLexical(
  query: string,
  corpus: readonly CorpusChunk[],
  topK: number,
): string[] {
  const queryTokens = tokenize(query).map(stem);
  const scored = corpus.map((chunk, index) => {
    const chunkTokens = tokenize(chunk.content);
    const counts = new Map<string, number>();
    for (const token of chunkTokens) {
      const s = stem(token);
      counts.set(s, (counts.get(s) ?? 0) + 1);
    }
    let raw = 0;
    for (const qt of queryTokens) {
      raw += counts.get(qt) ?? 0;
    }
    return {
      id: chunk.id,
      score: raw / Math.sqrt(Math.max(1, chunkTokens.length)),
      index,
    };
  });
  return scored
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, Math.max(0, topK))
    .map((r) => r.id);
}

/** Dataset integrity check so a broken fixture fails fast, never skews CI. */
export function validateDataset(
  cases: readonly EvaluationCase[],
  corpus: readonly CorpusChunk[],
): void {
  const corpusIds = new Set<string>();
  const errors: string[] = [];

  for (const chunk of corpus) {
    if (!chunk.id.trim()) errors.push('corpus chunk with empty id');
    if (corpusIds.has(chunk.id)) errors.push(`duplicate corpus chunk id: ${chunk.id}`);
    corpusIds.add(chunk.id);
    if (!chunk.content.trim()) errors.push(`corpus chunk ${chunk.id}: empty content`);
  }

  const caseIds = new Set<string>();
  for (const c of cases) {
    if (!c.id.trim()) errors.push('case with empty id');
    if (caseIds.has(c.id)) errors.push(`duplicate case id: ${c.id}`);
    caseIds.add(c.id);
    if (!c.query.trim()) errors.push(`case ${c.id}: query must not be empty`);
    if (!c.expectedRelevantChunkIds || c.expectedRelevantChunkIds.length === 0) {
      errors.push(`case ${c.id}: expectedRelevantChunkIds must contain at least one id`);
      continue;
    }
    for (const id of c.expectedRelevantChunkIds) {
      if (!corpusIds.has(id)) {
        errors.push(`case ${c.id}: expected chunk id "${id}" does not exist in the corpus`);
      }
    }
  }

  if (errors.length > 0) {
    throw new RagEvaluationError(
      `Evaluation dataset integrity check failed:\n  - ${errors.join('\n  - ')}`,
    );
  }
}

/**
 * Runs the evaluation: validate dataset -> rank each query with the
 * deterministic lexical baseline -> score with the pure metrics.
 */
export function runEvaluation(
  cases: readonly EvaluationCase[] = EVAL_CASES,
  corpus: readonly CorpusChunk[] = EVAL_CORPUS,
  topK = 5,
  kValues: readonly number[] = [1, 3, 5],
): EvaluationReport {
  const ks = assertEvaluationParams(cases, corpus, topK, kValues);

  const inputs: RankedCaseInput[] = cases.map((c) => ({
    caseId: c.id,
    query: c.query,
    retrievedIds: rankLexical(c.query, corpus, topK),
    relevantIds: c.expectedRelevantChunkIds,
  }));

  return evaluateCases(inputs, ks);
}

/**
 * Same evaluation over an injected retriever (e.g. the read-only
 * pgvector adapter). The default CLI run stays on the deterministic
 * lexical baseline; this path is opt-in via --retriever vector.
 */
export async function runEvaluationWithRetriever(
  retriever: Retriever,
  cases: readonly EvaluationCase[] = EVAL_CASES,
  corpus: readonly CorpusChunk[] = EVAL_CORPUS,
  topK = 5,
  kValues: readonly number[] = [1, 3, 5],
): Promise<EvaluationReport> {
  const ks = assertEvaluationParams(cases, corpus, topK, kValues);

  const inputs: RankedCaseInput[] = [];
  for (const c of cases) {
    inputs.push({
      caseId: c.id,
      query: c.query,
      retrievedIds: await retriever.retrieve(c.query, topK),
      relevantIds: c.expectedRelevantChunkIds,
    });
  }

  return evaluateCases(inputs, ks);
}

/** Shared validation/normalization for both evaluation entry points. */
function assertEvaluationParams(
  cases: readonly EvaluationCase[],
  corpus: readonly CorpusChunk[],
  topK: number,
  kValues: readonly number[],
): number[] {
  validateDataset(cases, corpus);
  if (!Number.isInteger(topK) || topK < 1) {
    throw new RagEvaluationError(`topK must be a positive integer, received ${topK}`);
  }
  const ks = normalizeKValues(kValues);
  if (ks[ks.length - 1] > topK) {
    throw new RagEvaluationError(
      `max kValues (${ks[ks.length - 1]}) must not exceed topK (${topK})`,
    );
  }
  return ks;
}

/* ------------------------------- CLI -------------------------------- */

interface CliArgs {
  retriever: 'deterministic' | 'vector';
  organizationId?: string;
}

/** Minimal flag parsing: --retriever deterministic|vector, --organization <id>. */
export function parseCliArgs(argv: readonly string[]): CliArgs {
  const args: CliArgs = { retriever: 'deterministic' };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case '--retriever': {
        const value = argv[i + 1];
        i += 1;
        if (value !== 'deterministic' && value !== 'vector') {
          throw new RagEvaluationError(`unsupported retriever "${value}" (expected deterministic|vector)`);
        }
        args.retriever = value;
        break;
      }
      case '--organization': {
        const value = argv[i + 1]?.trim();
        i += 1;
        if (!value) {
          throw new RagEvaluationError('--organization requires a value');
        }
        args.organizationId = value;
        break;
      }
      default:
        throw new RagEvaluationError(`unknown flag "${arg}"`);
    }
  }

  if (args.retriever === 'vector' && !args.organizationId) {
    throw new RagEvaluationError('--retriever vector requires --organization <orgId>');
  }
  return args;
}

const printReport = (report: EvaluationReport, retrieverName?: string): void => {
  console.log('RAG Evaluation');
  console.log('==============');
  console.log(`Dataset     : ${EVAL_CORPUS.length} synthetic chunks, ${EVAL_CASES.length} labeled cases`);
  if (retrieverName) {
    console.log(`Retriever   : ${retrieverName}`);
  }
  console.log(`Cases       : ${report.totalCases}`);
  for (const k of report.kValues) {
    console.log(`Recall@${k}    : ${report.meanRecallAtK[k].toFixed(2)}`);
  }
  console.log(`MRR         : ${report.mrr.toFixed(2)}`);
  console.log(`Passed      : ${report.passedCases}/${report.totalCases} (relevant chunk in top ${report.kValues[report.kValues.length - 1]})`);
  if (report.failedCaseIds.length > 0) {
    console.log('Failed cases (no relevant chunk retrieved):');
    for (const id of report.failedCaseIds) {
      const c = EVAL_CASES.find((x) => x.id === id);
      console.log(`  x ${id} (${c?.query ?? 'unknown'})`);
    }
  }
};

const main = async (): Promise<void> => {
  const args = parseCliArgs(process.argv.slice(2));

  let report: EvaluationReport;
  let retrieverName: string | undefined;

  if (args.retriever === 'vector') {
    // Lazy-loaded so the default deterministic run never touches
    // VectorService / prisma (keeps `npm run eval:rag` fully offline).
    const { VectorRetriever } = await import('./retrievers/vector.retriever');
    const { VectorService } = await import('../services/vector.service');
    const retriever = new VectorRetriever(
      new VectorService(),
      args.organizationId as string,
      EVAL_CORPUS,
    );
    report = await runEvaluationWithRetriever(retriever);
    retrieverName = retriever.name;
  } else {
    report = runEvaluation();
  }

  printReport(report, retrieverName);

  // Regression gate (ledger #26): when RAG_EVAL_MIN_MRR / RAG_EVAL_MIN_RECALL_AT_5
  // are set (e.g. in CI), fail the run if the scores drop below the floor.
  // Off by default so the command remains informational for local use;
  // floors are relative to the deterministic baseline, NOT a claim about
  // production retrieval quality.
  const minMrr = parseOptionalEnvNumber('RAG_EVAL_MIN_MRR');
  const minRecallAt5 = parseOptionalEnvNumber('RAG_EVAL_MIN_RECALL_AT_5');
  if (minMrr !== undefined || minRecallAt5 !== undefined) {
    if (!meetsRegressionFloors(report, minMrr, minRecallAt5)) {
      const maxK = report.kValues[report.kValues.length - 1];
      const recallAtMaxK = report.meanRecallAtK[maxK] ?? 0;
      console.error(
        `[eval:rag] REGRESSION: MRR ${report.mrr.toFixed(3)} (floor ${minMrr ?? 'unset'}), ` +
          `Recall@${maxK} ${recallAtMaxK.toFixed(3)} (floor ${minRecallAt5 ?? 'unset'})`,
      );
      process.exit(1);
    }
    const maxK = report.kValues[report.kValues.length - 1];
    console.log(
      `Thresholds  : MRR >= ${minMrr ?? 'unset'} AND Recall@${maxK} >= ${minRecallAt5 ?? 'unset'} — PASS`,
    );
  }
};

/** Parses an optional env number (undefined when unset/empty). */
function parseOptionalEnvNumber(name: string): number | undefined {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new RagEvaluationError(`${name} must be a number between 0 and 1`);
  }
  return value;
}

/**
 * Regression gate result for the CLI (ledger #26). Exported for tests.
 * Returns true when every set floor is met; a floor is only enforced
 * when the corresponding min value is defined.
 */
export function meetsRegressionFloors(
  report: EvaluationReport,
  minMrr?: number,
  minRecallAt5?: number,
): boolean {
  if (minMrr === undefined && minRecallAt5 === undefined) return true;
  const maxK = report.kValues[report.kValues.length - 1];
  const recallAtMaxK = report.meanRecallAtK[maxK] ?? 0;
  const mrrOk = minMrr === undefined || report.mrr >= minMrr;
  const recallOk = minRecallAt5 === undefined || recallAtMaxK >= minRecallAt5;
  return mrrOk && recallOk;
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error(
      `[eval:rag] Evaluation failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  });
}
