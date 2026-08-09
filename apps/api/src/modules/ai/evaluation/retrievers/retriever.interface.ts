/*
 * RAG EVALUATION RETRIEVER CONTRACT (ledger #22 — 2026-08-09)
 * A retriever turns a query into a ranked list of chunk ids (best
 * first). The deterministic lexical baseline (evaluate.ts) and the
 * optional read-only pgvector adapter (vector.retriever.ts) both
 * implement it, so the same labeled dataset can score either path.
 */

export interface Retriever {
  /** Human-readable retriever name reported in the evaluation output. */
  readonly name: string;

  /** Ranked chunk ids for the query, best first, at most topK. */
  retrieve(query: string, topK: number): Promise<string[]>;
}
