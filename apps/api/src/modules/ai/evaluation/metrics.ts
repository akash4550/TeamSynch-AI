/*
 * RAG EVALUATION METRICS (ledger #18 — 2026-08-09)
 * Pure, deterministic retrieval-quality metrics. No imports: plain
 * functions over id lists, so the math is unit-testable in isolation.
 *   - Recall@K = |relevant ∩ top-K retrieved| / |relevant|
 *   - Reciprocal Rank = 1 / rank of the FIRST relevant result (0 when
 *     nothing relevant is retrieved); MRR = mean across cases.
 * Guards: an EMPTY expected-relevant set is a dataset error (Recall's
 * denominator would be zero) and throws RagEvaluationError — never a
 * silent NaN or misleading zero. Duplicate ids are de-duplicated so
 * duplicates cannot inflate recall above 1.
 */

/** Thrown when metric input violates the evaluation contract. */
export class RagEvaluationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RagEvaluationError';
  }
}

/** One scored retrieval run. */
export interface RankedCaseInput {
  caseId: string;
  query: string;
  /** Retrieved chunk ids, best first (rank 1 = first element). */
  retrievedIds: string[];
  /** Expected relevant chunk ids (>= 1 required). */
  relevantIds: string[];
}

/** Per-case metric scores. */
export interface CaseScore {
  caseId: string;
  query: string;
  recallAtK: Record<number, number>;
  /** 1 / firstRelevantRank, or 0 when nothing relevant was retrieved. */
  reciprocalRank: number;
  /** 1-based rank of the first relevant hit, or null when none retrieved. */
  firstRelevantRank: number | null;
}

/** Aggregated report across all cases. */
export interface EvaluationReport {
  totalCases: number;
  kValues: number[];
  /** Mean Recall@K over all cases, keyed by K. */
  meanRecallAtK: Record<number, number>;
  /** Mean Reciprocal Rank over all cases. */
  mrr: number;
  /** Cases with at least one relevant chunk in the top max(kValues). */
  passedCases: number;
  /** Case ids with zero recall at top max(kValues) (informational). */
  failedCaseIds: string[];
  caseScores: CaseScore[];
}

const validateK = (k: number): void => {
  if (!Number.isInteger(k) || k < 1) {
    throw new RagEvaluationError(
      `k must be a positive integer, received ${JSON.stringify(k)}`,
    );
  }
};

const requireRelevant = (relevantIds: readonly string[]): Set<string> => {
  const relevant = new Set(relevantIds);
  if (relevant.size === 0) {
    throw new RagEvaluationError(
      'Expected-relevant id list is empty; a scoreable case needs at least one relevant id (dataset error)',
    );
  }
  return relevant;
};

/** Counts DISTINCT relevant ids present (duplicates never inflate recall). */
const countDistinctHits = (
  rankedIds: readonly string[],
  relevant: ReadonlySet<string>,
): number => {
  const found = new Set<string>();
  for (const id of rankedIds) {
    if (relevant.has(id)) found.add(id);
  }
  return found.size;
};

/** Recall@K: fraction of expected relevant ids present in the first K results. */
export function recallAtK(
  rankedIds: readonly string[],
  relevantIds: readonly string[],
  k: number,
): number {
  validateK(k);
  const relevant = requireRelevant(relevantIds);
  return countDistinctHits(rankedIds.slice(0, k), relevant) / relevant.size;
}

/** 1-based rank of the first relevant result, or null when none retrieved. */
export function firstRelevantRank(
  rankedIds: readonly string[],
  relevantIds: readonly string[],
): number | null {
  const relevant = requireRelevant(relevantIds);
  for (let i = 0; i < rankedIds.length; i += 1) {
    if (relevant.has(rankedIds[i])) return i + 1;
  }
  return null;
}

/** Reciprocal rank: 1 / firstRelevantRank, or 0 when nothing relevant is retrieved. */
export function reciprocalRank(
  rankedIds: readonly string[],
  relevantIds: readonly string[],
): number {
  const rank = firstRelevantRank(rankedIds, relevantIds);
  return rank === null ? 0 : 1 / rank;
}

/** Validates and normalizes the K depths to evaluate. */
export function normalizeKValues(kValues: readonly number[]): number[] {
  if (kValues.length === 0) {
    throw new RagEvaluationError('kValues must contain at least one K');
  }
  const unique = [...new Set(kValues)];
  unique.forEach(validateK);
  return unique.sort((a, b) => a - b);
}

/** Scores a single retrieval run across the requested K depths. */
export function scoreCase(
  input: RankedCaseInput,
  kValues: readonly number[],
): CaseScore {
  const ks = normalizeKValues(kValues);
  const relevant = requireRelevant(input.relevantIds);

  const recallAtK: Record<number, number> = {};
  for (const k of ks) {
    recallAtK[k] =
      countDistinctHits(input.retrievedIds.slice(0, k), relevant) /
      relevant.size;
  }

  const rank = firstRelevantRank(input.retrievedIds, input.relevantIds);
  return {
    caseId: input.caseId,
    query: input.query,
    recallAtK,
    reciprocalRank: rank === null ? 0 : 1 / rank,
    firstRelevantRank: rank,
  };
}

/** Scores every case and aggregates: mean Recall@K, MRR, pass/fail counts. */
export function evaluateCases(
  inputs: readonly RankedCaseInput[],
  kValues: readonly number[],
): EvaluationReport {
  const ks = normalizeKValues(kValues);
  const caseScores = inputs.map((input) => scoreCase(input, ks));
  const maxK = ks[ks.length - 1];

  const meanRecallAtK: Record<number, number> = {};
  for (const k of ks) {
    const total = caseScores.reduce((sum, c) => sum + c.recallAtK[k], 0);
    meanRecallAtK[k] = caseScores.length === 0 ? 0 : total / caseScores.length;
  }

  const mrr =
    caseScores.length === 0
      ? 0
      : caseScores.reduce((sum, c) => sum + c.reciprocalRank, 0) /
        caseScores.length;

  return {
    totalCases: caseScores.length,
    kValues: ks,
    meanRecallAtK,
    mrr,
    passedCases: caseScores.filter((c) => c.recallAtK[maxK] > 0).length,
    failedCaseIds: caseScores
      .filter((c) => c.recallAtK[maxK] === 0)
      .map((c) => c.caseId)
      .sort(),
    caseScores,
  };
}
