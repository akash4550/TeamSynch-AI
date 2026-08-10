import { AskAssistantSchema, SummarizeTaskSchema } from '../ai.dto';

/*
 * Assistant/task-summary DTO tests (ledger #33) — deterministic, DB-free.
 * Pins the remaining AI route validation contract beyond the RAG schema:
 * the discriminated GLOBAL/TASK/PROJECT context rules and the UUID
 * task-param requirement on the summary route.
 */

describe('AskAssistantSchema (discriminated context union)', () => {
  it('accepts GLOBAL context with no entity', () => {
    const result = AskAssistantSchema.safeParse({
      body: { query: 'Summarize', contextType: 'GLOBAL' },
      query: {},
      params: {},
    });
    expect(result.success).toBe(true);
  });

  it('rejects GLOBAL context with an entity (no entity allowed)', () => {
    const result = AskAssistantSchema.safeParse({
      body: { query: 'Summarize', contextType: 'GLOBAL', entityId: 'task-1' },
      query: {},
      params: {},
    });
    expect(result.success).toBe(false);
  });

  it('accepts TASK context with a valid UUID entity', () => {
    const result = AskAssistantSchema.safeParse({
      body: {
        query: 'Summarize',
        contextType: 'TASK',
        entityId: '5d1f0f2e-8c1a-4b7a-9e3d-1f2a3b4c5d6e',
      },
      query: {},
      params: {},
    });
    expect(result.success).toBe(true);
  });

  it('rejects TASK context with a non-UUID entity', () => {
    const result = AskAssistantSchema.safeParse({
      body: { query: 'Summarize', contextType: 'TASK', entityId: 'not-a-uuid' },
      query: {},
      params: {},
    });
    expect(result.success).toBe(false);
  });

  it('rejects TASK context with a missing entity', () => {
    const result = AskAssistantSchema.safeParse({
      body: { query: 'Summarize', contextType: 'TASK' },
      query: {},
      params: {},
    });
    expect(result.success).toBe(false);
  });

  it('accepts PROJECT context with a valid UUID entity', () => {
    const result = AskAssistantSchema.safeParse({
      body: {
        query: 'Summarize',
        contextType: 'PROJECT',
        entityId: '5d1f0f2e-8c1a-4b7a-9e3d-1f2a3b4c5d6e',
      },
      query: {},
      params: {},
    });
    expect(result.success).toBe(true);
  });

  it('rejects an unknown context type', () => {
    const result = AskAssistantSchema.safeParse({
      body: { query: 'Summarize', contextType: 'CRM' },
      query: {},
      params: {},
    });
    expect(result.success).toBe(false);
  });

  it('rejects an oversized query (> 2000 chars)', () => {
    const result = AskAssistantSchema.safeParse({
      body: { query: 'a'.repeat(2001), contextType: 'GLOBAL' },
      query: {},
      params: {},
    });
    expect(result.success).toBe(false);
  });
});

describe('SummarizeTaskSchema (GET /api/v1/ai/tasks/:taskId/summary)', () => {
  it('accepts a valid UUID task param', () => {
    const result = SummarizeTaskSchema.safeParse({
      body: {},
      query: {},
      params: { taskId: '5d1f0f2e-8c1a-4b7a-9e3d-1f2a3b4c5d6e' },
    });
    expect(result.success).toBe(true);
  });

  it('rejects a non-UUID task param', () => {
    const result = SummarizeTaskSchema.safeParse({
      body: {},
      query: {},
      params: { taskId: 'not-a-uuid' },
    });
    expect(result.success).toBe(false);
  });

  it('rejects a missing task param', () => {
    const result = SummarizeTaskSchema.safeParse({ body: {}, query: {}, params: {} });
    expect(result.success).toBe(false);
  });
});
