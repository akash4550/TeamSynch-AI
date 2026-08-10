import { isRagBudgetExhausted } from '../rag-ingestion.processor';

/*
 * RAG budget gate tests (ledger #27) — deterministic, no DB. This is the
 * cost-control critical path (per-org monthly RAG token budget); the
 * extracted pure function is tested exhaustively over its boundary.
 */

describe('isRagBudgetExhausted', () => {
  it('blocks when the budget is spent AND embeds are pending', () => {
    expect(isRagBudgetExhausted(5_000_000, 5_000_000, 3)).toBe(true);
    expect(isRagBudgetExhausted(5_000_000, 5_000_001, 1)).toBe(true);
  });

  it('allows the zero-spend reconcile when spent but nothing to embed', () => {
    // The documented #16 contract: an exhausted budget with NO pending
    // embeds must NOT block the reconcile (it spends nothing).
    expect(isRagBudgetExhausted(5_000_000, 5_000_000, 0)).toBe(false);
  });

  it('allows when below the budget regardless of pending embeds', () => {
    expect(isRagBudgetExhausted(5_000_000, 4_999_999, 10)).toBe(false);
    expect(isRagBudgetExhausted(5_000_000, 0, 1)).toBe(false);
  });

  it('handles boundary and degenerate values deterministically', () => {
    // spent === budget - 1 is NOT exhausted.
    expect(isRagBudgetExhausted(100, 99, 1)).toBe(false);
    // Exactly at the cap with pending work IS exhausted.
    expect(isRagBudgetExhausted(100, 100, 1)).toBe(true);
    // Negative/zero budget with any pending work is exhausted.
    expect(isRagBudgetExhausted(0, 0, 1)).toBe(true);
    // No pending embeds is never blocked.
    expect(isRagBudgetExhausted(0, 0, 0)).toBe(false);
  });
});
