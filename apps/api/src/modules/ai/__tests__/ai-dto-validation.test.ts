import { RagAskSchema, AskAssistantSchema } from '../ai.dto';

/*
 * AI route DTO validation tests (ledger #28) — deterministic, DB-free.
 * The RAG route spends REAL provider tokens per request, so its
 * validation contract is a cost-protection surface: missing, empty,
 * oversized, or extra-field payloads must be rejected BEFORE any
 * provider call. These tests pin the exact zod contract that the
 * validateRequest middleware enforces at the HTTP layer.
 */

describe('RagAskSchema (POST /api/v1/ai/rag/ask)', () => {
  const validBody = { query: 'How do I archive a project?' };

  it('accepts a valid trimmed query', () => {
    const result = RagAskSchema.safeParse({
      body: { query: '  How do I archive a project?  ' },
      query: {},
      params: {},
    });
    expect(result.success).toBe(true);
    if (result.success) {
      // Trimmed by the schema.
      expect(result.data.body.query).toBe('How do I archive a project?');
    }
  });

  it('rejects a missing query', () => {
    const result = RagAskSchema.safeParse({ body: {}, query: {}, params: {} });
    expect(result.success).toBe(false);
  });

  it('rejects a whitespace-only query', () => {
    const result = RagAskSchema.safeParse({
      body: { query: '   ' },
      query: {},
      params: {},
    });
    expect(result.success).toBe(false);
  });

  it('rejects an oversized query (> 2000 chars)', () => {
    const result = RagAskSchema.safeParse({
      body: { query: 'a'.repeat(2001) },
      query: {},
      params: {},
    });
    expect(result.success).toBe(false);
  });

  it('accepts exactly 2000 chars (boundary)', () => {
    const result = RagAskSchema.safeParse({
      body: { query: 'a'.repeat(2000) },
      query: {},
      params: {},
    });
    expect(result.success).toBe(true);
  });

  it('rejects unknown fields (tenant spoof attempt)', () => {
    const result = RagAskSchema.safeParse({
      body: { ...validBody, organizationId: 'org-other' },
      query: {},
      params: {},
    });
    expect(result.success).toBe(false);
  });

  it('rejects a non-string query', () => {
    const result = RagAskSchema.safeParse({
      body: { query: 42 },
      query: {},
      params: {},
    });
    expect(result.success).toBe(false);
  });
});

describe('AskAssistantSchema (POST /api/v1/ai/assistant/ask)', () => {
  it('rejects a missing query (mirrors the RAG contract)', () => {
    const result = AskAssistantSchema.safeParse({
      body: { contextType: 'GLOBAL' },
      query: {},
      params: {},
    });
    expect(result.success).toBe(false);
  });

  it('rejects unknown fields', () => {
    const result = AskAssistantSchema.safeParse({
      body: {
        query: 'Summarize',
        contextType: 'GLOBAL',
        organizationId: 'org-other',
      },
      query: {},
      params: {},
    });
    expect(result.success).toBe(false);
  });
});
