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

  const inputs: RankedCaseInput[] = cases.map((c) => ({
    caseId: c.id,
    query: c.query,
    retrievedIds: rankLexical(c.query, corpus, topK),
    relevantIds: c.expectedRelevantChunkIds,
  }));

  return evaluateCases(inputs, ks);
}

/* ------------------------------- CLI -------------------------------- */

const printReport = (report: EvaluationReport): void => {
  console.log('RAG Evaluation');
  console.log('==============');
  console.log(`Dataset     : ${EVAL_CORPUS.length} synthetic chunks, ${EVAL_CASES.length} labeled cases`);
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

if (require.main === module) {
  try {
    printReport(runEvaluation());
  } catch (error: unknown) {
    console.error(
      `[eval:rag] Evaluation failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  }
}
