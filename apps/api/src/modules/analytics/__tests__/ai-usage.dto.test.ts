import { GetAIUsageSchema, AI_USAGE_MAX_DAYS, AI_USAGE_DEFAULT_DAYS } from '../ai-usage.dto';

/*
 * AI usage analytics DTO tests (ledger #32) — deterministic, DB-free.
 * Pins the exact zod contract the analytics route enforces: only the
 * bounded `days` query parameter is accepted (1-90, integer), and
 * unknown fields/params/bodies are rejected.
 */

describe('GetAIUsageSchema', () => {
  it('accepts no query parameters (defaults apply)', () => {
    const result = GetAIUsageSchema.safeParse({ body: {}, query: {}, params: {} });
    expect(result.success).toBe(true);
  });

  it('accepts a valid days value within bounds', () => {
    for (const days of [1, 7, 30, 90]) {
      const result = GetAIUsageSchema.safeParse({ body: {}, query: { days }, params: {} });
      expect(result.success).toBe(true);
    }
  });

  it('accepts days as a numeric string (coerced)', () => {
    const result = GetAIUsageSchema.safeParse({ body: {}, query: { days: '30' }, params: {} });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.query.days).toBe(30);
  });

  it('rejects days above the documented maximum', () => {
    const result = GetAIUsageSchema.safeParse({
      body: {},
      query: { days: AI_USAGE_MAX_DAYS + 1 },
      params: {},
    });
    expect(result.success).toBe(false);
  });

  it('rejects days below 1', () => {
    for (const days of [0, -5]) {
      const result = GetAIUsageSchema.safeParse({ body: {}, query: { days }, params: {} });
      expect(result.success).toBe(false);
    }
  });

  it('rejects non-integer days', () => {
    for (const days of [1.5, Number.NaN]) {
      const result = GetAIUsageSchema.safeParse({ body: {}, query: { days }, params: {} });
      expect(result.success).toBe(false);
    }
  });

  it('rejects unknown query fields (no arbitrary filters)', () => {
    const result = GetAIUsageSchema.safeParse({
      body: {},
      query: { days: 30, userId: 'u-1' },
      params: {},
    });
    expect(result.success).toBe(false);
  });

  it('rejects unknown body fields', () => {
    const result = GetAIUsageSchema.safeParse({
      body: { hack: true },
      query: {},
      params: {},
    });
    expect(result.success).toBe(false);
  });

  it('rejects unknown params', () => {
    const result = GetAIUsageSchema.safeParse({
      body: {},
      query: {},
      params: { id: 'x' },
    });
    expect(result.success).toBe(false);
  });

  it('exposes the documented defaults for the service', () => {
    expect(AI_USAGE_DEFAULT_DAYS).toBe(30);
    expect(AI_USAGE_MAX_DAYS).toBe(90);
  });
});
