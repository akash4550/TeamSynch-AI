import { VectorService, chunkContentHash } from '../vector.service';

/*
 * VectorService pure-logic tests (ledger #30) — deterministic, DB-free.
 * chunkText is the chunking core of RAG ingestion: chunk size/overlap
 * directly shape retrieval quality, and the ledger #9 hardening guards
 * against the historical infinite-loop config (overlap >= chunkSize).
 * chunkContentHash is the dedupe-pool key (must stay byte-identical to
 * the SQL backfill's encode(digest(contentChunk,'sha256'),'hex')).
 */

describe('chunkText', () => {
  const service = new VectorService();

  it('splits a long text into chunks of the configured size', () => {
    const text = 'a'.repeat(2500);
    const chunks = service.chunkText(text, 1000, 200);

    expect(chunks.length).toBeGreaterThan(2);
    expect(chunks[0]).toHaveLength(1000);
    // Every chunk is trimmed and non-empty.
    for (const chunk of chunks) {
      expect(chunk.trim().length).toBeGreaterThan(0);
    }
  });

  it('applies the overlap (start advances by chunkSize - overlap)', () => {
    const text = 'a'.repeat(1200);
    // chunkSize 1000, overlap 200 -> first chunk [0,1000), second starts
    // at 800 -> [800, 1200) = 400 chars.
    const chunks = service.chunkText(text, 1000, 200);
    expect(chunks[0]).toHaveLength(1000);
    expect(chunks[1]).toHaveLength(400);
  });

  it('returns a single chunk when the text fits within the chunk size', () => {
    const chunks = service.chunkText('short text', 1000, 200);
    expect(chunks).toEqual(['short text']);
  });

  it('returns [] for empty or whitespace-only text', () => {
    expect(service.chunkText('', 1000, 200)).toEqual([]);
    expect(service.chunkText('   \n\t ', 1000, 200)).toEqual([]);
    // @ts-expect-error -- deliberately passing null to the runtime guard.
    expect(service.chunkText(null, 1000, 200)).toEqual([]);
  });

  it('trims chunk edges so content does not start/end on whitespace', () => {
    const text = `  ${'x'.repeat(990)}   ${'y'.repeat(990)}  `;
    const chunks = service.chunkText(text, 500, 100);
    for (const chunk of chunks) {
      expect(chunk.startsWith(' ')).toBe(false);
      expect(chunk.endsWith(' ')).toBe(false);
    }
  });

  it('guards against an invalid chunkSize (would be a nonsense config)', () => {
    expect(() => service.chunkText('text', 0, 0)).toThrow(/chunkSize must be positive/);
    expect(() => service.chunkText('text', -5, 0)).toThrow(/chunkSize must be positive/);
  });

  it('guards against overlap >= chunkSize (the historical infinite-loop config)', () => {
    // ledger #9: overlap >= chunkSize made `start` advance by <= 0 —
    // an infinite loop. It must throw immediately instead.
    expect(() => service.chunkText('text', 100, 100)).toThrow(/overlap must be >= 0 and < chunkSize/);
    expect(() => service.chunkText('text', 100, 200)).toThrow(/overlap must be >= 0 and < chunkSize/);
    expect(() => service.chunkText('text', 100, -1)).toThrow(/overlap must be >= 0 and < chunkSize/);
  });

  it('accepts the zero-overlap boundary', () => {
    const chunks = service.chunkText('a'.repeat(1500), 500, 0);
    expect(chunks).toHaveLength(3);
    for (const chunk of chunks) expect(chunk).toHaveLength(500);
  });

  it('is deterministic: identical input yields identical chunks', () => {
    const text = 'The quick brown fox jumps over the lazy dog. '.repeat(40);
    expect(service.chunkText(text, 200, 50)).toEqual(service.chunkText(text, 200, 50));
  });
});

describe('chunkContentHash', () => {
  it('produces a deterministic 64-char sha256 hex digest', () => {
    const hash = chunkContentHash('chunk content');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(chunkContentHash('chunk content')).toBe(hash);
  });

  it('matches a known sha256 value (SQL backfill parity)', () => {
    // sha256('hello world') — must match the migration's
    // encode(digest(contentChunk,'sha256'),'hex') byte-for-byte.
    expect(chunkContentHash('hello world')).toBe(
      'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9',
    );
  });

  it('differs for different content (no collisions in practice)', () => {
    expect(chunkContentHash('a')).not.toBe(chunkContentHash('b'));
  });
});
