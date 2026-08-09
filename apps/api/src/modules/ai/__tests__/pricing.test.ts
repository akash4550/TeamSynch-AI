import { estimateCostUsd } from '../pricing';

describe('estimateCostUsd', () => {
  it('estimates gpt-4o-mini cost from provider-reported tokens', () => {
    // 1M prompt tokens @ $0.15 + 1M completion tokens @ $0.60
    const cost = estimateCostUsd({
      provider: 'OPENAI',
      model: 'gpt-4o-mini',
      promptTokens: 1_000_000,
      completionTokens: 1_000_000,
    });
    expect(cost).toBeCloseTo(0.75, 6);
  });

  it('scales linearly with token counts', () => {
    const half = estimateCostUsd({
      provider: 'OPENAI',
      model: 'gpt-4o-mini',
      promptTokens: 500_000,
      completionTokens: 500_000,
    });
    expect(half).toBeCloseTo(0.375, 6);
  });

  it('handles embeddings via the input rate only', () => {
    const cost = estimateCostUsd({
      provider: 'OPENAI',
      model: 'text-embedding-3-small',
      promptTokens: 1_000_000,
      completionTokens: 0,
    });
    expect(cost).toBeCloseTo(0.02, 6);
  });

  it('uses a conservative default for unknown chat models', () => {
    const cost = estimateCostUsd({
      provider: 'OPENAI',
      model: 'brand-new-model-2026',
      promptTokens: 1_000_000,
      completionTokens: 1_000_000,
    });
    // Default: $1/MTok input + $2/MTok output.
    expect(cost).toBeCloseTo(3.0, 6);
  });

  it('estimates zero for MOCK providers (no real usage)', () => {
    const cost = estimateCostUsd({
      provider: 'MOCK',
      model: 'mock-model-v1',
      promptTokens: 999_999,
      completionTokens: 999_999,
    });
    expect(cost).toBe(0);
  });

  it('estimates zero for zero-token calls', () => {
    const cost = estimateCostUsd({
      provider: 'OPENAI',
      model: 'gpt-4o-mini',
      promptTokens: 0,
      completionTokens: 0,
    });
    expect(cost).toBe(0);
  });

  it('is case-insensitive on provider and model', () => {
    const upper = estimateCostUsd({
      provider: 'openai',
      model: 'GPT-4O-MINI',
      promptTokens: 1_000_000,
      completionTokens: 0,
    });
    expect(upper).toBeCloseTo(0.15, 6);
  });

  it('clamps negative/NaN token counts to zero', () => {
    const cost = estimateCostUsd({
      provider: 'OPENAI',
      model: 'gpt-4o-mini',
      promptTokens: -5,
      completionTokens: Number.NaN,
    });
    expect(cost).toBe(0);
  });
});
