/*
 * FEATURE (ledger #16 — 2026-08-05, APPROVED dedupe-full): pins for the
 * content-hash chunk-dedupe reuse planner. These freeze the exact plan
 * matrix the worker's reconcile executes: family rows are re-pointed at
 * zero spend, other-document rows only DONATE copies (never stolen —
 * stealing would rob the donor of its searchability), genuinely new text
 * embeds, and a chunk duplicated within one document re-points once then
 * copies. Pure and DB-free by design.
 */
import {
  planChunkReuse,
  type ReusePoolRow,
} from '../rag-ingestion.processor';
import { chunkContentHash } from '../../../ai/services/vector.service';

const H = (text: string) => chunkContentHash(text);
const hashesOf = (chunks: string[]) => chunks.map(H);

describe('chunkContentHash (ledger #16)', () => {
  it('matches canonical sha256 hex — byte-parity with the SQL backfill digest()', () => {
    // Known sha256 vectors; the migration backfills with
    // encode(digest(contentChunk,'sha256'),'hex') — same bytes, same hex.
    expect(chunkContentHash('hello')).toBe(
      '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
    );
    expect(chunkContentHash('')).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
    expect(chunkContentHash('hello')).toHaveLength(64);
  });
});

describe('planChunkReuse (ledger #16 — dedupe-full)', () => {
  const FAMILY = new Set(['d1', 'd2']);
  const pool = (rows: ReusePoolRow[]): ReusePoolRow[] => rows;

  it('re-points family rows (the outgoing head) at zero spend — full version-flip reuse', () => {
    const chunks = ['alpha', 'beta'];
    const { plans, pendingEmbeds } = planChunkReuse(
      chunks,
      hashesOf(chunks),
      pool([
        { id: 'r1', documentId: 'd1', chunkHash: H('alpha') },
        { id: 'r2', documentId: 'd2', chunkHash: H('beta') },
      ]),
      FAMILY,
    );
    expect(plans[0]).toMatchObject({ kind: 'repoint', sourceRowId: 'r1' });
    expect(plans[1]).toMatchObject({ kind: 'repoint', sourceRowId: 'r2' });
    expect(pendingEmbeds).toBe(0);
  });

  it("treats this head's own survivor rows as family — a retry of a partial pass converges without re-embedding", () => {
    const chunks = ['alpha'];
    const { plans, pendingEmbeds } = planChunkReuse(
      chunks,
      hashesOf(chunks),
      pool([{ id: 'r9', documentId: 'd1', chunkHash: H('alpha') }]),
      FAMILY,
    );
    expect(plans[0]).toMatchObject({ kind: 'repoint', sourceRowId: 'r9' });
    expect(pendingEmbeds).toBe(0);
  });

  it('copy-inserts from OTHER live documents and never steals the donor row', () => {
    const chunks = ['shared boilerplate'];
    const { plans, pendingEmbeds } = planChunkReuse(
      chunks,
      hashesOf(chunks),
      pool([{ id: 'r3', documentId: 'dOTHER', chunkHash: H('shared boilerplate') }]),
      FAMILY,
    );
    expect(plans[0]).toMatchObject({ kind: 'copy', sourceRowId: 'r3' });
    expect(pendingEmbeds).toBe(0);
  });

  it('a chunk duplicated INSIDE one document: first re-points the donor, second copy-inserts (idempotent)', () => {
    const chunks = ['alpha', 'alpha', 'beta'];
    const { plans, pendingEmbeds } = planChunkReuse(
      chunks,
      hashesOf(chunks),
      pool([
        { id: 'r1', documentId: 'd1', chunkHash: H('alpha') },
        { id: 'r2', documentId: 'd1', chunkHash: H('beta') },
      ]),
      FAMILY,
    );
    expect(plans[0]).toMatchObject({ kind: 'repoint', sourceRowId: 'r1' });
    expect(plans[1]).toMatchObject({ kind: 'copy', sourceRowId: 'r1' });
    expect(plans[2]).toMatchObject({ kind: 'repoint', sourceRowId: 'r2' });
    expect(pendingEmbeds).toBe(0);
  });

  it('genuinely new text embeds, and pendingEmbeds counts only the unknowns', () => {
    const chunks = ['alpha', 'brand new text', 'gamma'];
    const { plans, pendingEmbeds } = planChunkReuse(
      chunks,
      hashesOf(chunks),
      pool([{ id: 'r1', documentId: 'd1', chunkHash: H('alpha') }]),
      FAMILY,
    );
    expect(plans[0].kind).toBe('repoint');
    expect(plans[1].kind).toBe('embed');
    expect(plans[2].kind).toBe('embed');
    expect(pendingEmbeds).toBe(2);
  });

  it('an empty pool embeds everything (fresh document semantics unchanged)', () => {
    const chunks = ['a', 'b', 'c'];
    const { plans, pendingEmbeds } = planChunkReuse(chunks, hashesOf(chunks), [], FAMILY);
    expect(plans.every((plan) => plan.kind === 'embed')).toBe(true);
    expect(pendingEmbeds).toBe(3);
  });

  it('pool rows without a chunkHash are ignored (pre-backfill shadow state)', () => {
    const chunks = ['alpha'];
    const { plans, pendingEmbeds } = planChunkReuse(
      chunks,
      hashesOf(chunks),
      pool([{ id: 'rNull', documentId: 'd1', chunkHash: null }]),
      FAMILY,
    );
    expect(plans[0].kind).toBe('embed');
    expect(pendingEmbeds).toBe(1);
  });
});
