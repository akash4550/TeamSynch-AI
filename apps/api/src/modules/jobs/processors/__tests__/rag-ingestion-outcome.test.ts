/*
 * FEATURE (ledger #15 — 2026-08-05): pins the honesty rules of the
 * ingestion-outcome persistence patch that finish() writes onto every
 * document row (the Documents UI "AI Search" badge reads them). Pure and
 * DB-free by design.
 */
import { buildIngestPersistencePatch } from '../rag-ingestion.processor';

describe('buildIngestPersistencePatch (ledger #15)', () => {
  it('a successful pass CLEARS any previous skip reason', () => {
    const patch = buildIngestPersistencePatch({ status: 'ingested', chunksStored: 4 });
    expect(patch.ingestStatus).toBe('ingested');
    expect(patch.ingestReason).toBeNull();
    expect(patch.ingestedAt).toBeInstanceOf(Date);
  });

  it('a skipped pass carries its UI-safe reason', () => {
    const patch = buildIngestPersistencePatch({
      status: 'skipped',
      reason: 'superseded document version',
    });
    expect(patch.ingestStatus).toBe('skipped');
    expect(patch.ingestReason).toBe('superseded document version');
  });

  it('a partial-budget pass keeps the budget explanation for the badge', () => {
    const patch = buildIngestPersistencePatch({
      status: 'partial_budget',
      reason: 'monthly RAG token budget reached (4999900/5000000)',
      chunksStored: 2,
    });
    expect(patch.ingestStatus).toBe('partial_budget');
    expect(patch.ingestReason).toContain('budget');
  });

  it('never fabricates a reason when the outcome has none', () => {
    const patch = buildIngestPersistencePatch({ status: 'skipped' });
    expect(patch.ingestReason).toBeNull();
  });
});
