/*
 * AI COST ESTIMATION (ledger #23 — 2026-08-09)
 * ---------------------------------------------
 * Pure, deterministic USD cost estimation from provider-reported token
 * usage. This is an ESTIMATE for observability (populates the existing
 * AIUsageLog.cost column) — it is NOT a billing calculation.
 *
 * Rates are per-1M-tokens in USD, matching public list prices at the
 * time of writing, keyed by model name as reported by the provider.
 * Unknown models fall back to a documented conservative default so cost
 * tracking never silently reports zero for a newly shipped model.
 * Providers without real usage (MOCK) estimate to 0 — fabricating cost
 * would be as dishonest as fabricating tokens.
 *
 * Kept dependency-free and import-free so it is trivially unit-testable
 * and reusable (analytics, budgets, dashboards).
 */

export interface CostInput {
  provider: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
}

/** USD per 1M tokens, { input, output } — public list prices (2026). */
const RATES_USD_PER_MTOK: Record<string, { input: number; output: number }> = {
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gpt-4o': { input: 2.5, output: 10 },
  'gpt-4.1-mini': { input: 0.4, output: 1.6 },
  'gpt-4.1': { input: 2, output: 8 },
  'text-embedding-3-small': { input: 0.02, output: 0 },
  'text-embedding-3-large': { input: 0.13, output: 0 },
};

/**
 * Conservative default for unknown chat models (USD per 1M tokens).
 * Chosen above the cheapest tier so spend is over- not under-estimated.
 */
const DEFAULT_CHAT_RATE: { input: number; output: number } = { input: 1, output: 2 };

/** Normalizes a provider-reported model name for the pricing table. */
const normalizeModel = (model: string): string =>
  model.trim().toLowerCase();

/**
 * Estimated USD cost of a single call. Returns 0 for providers whose
 * token usage is not real (MOCK) and for zero-token calls.
 */
export function estimateCostUsd(input: CostInput): number {
  const provider = input.provider.trim().toUpperCase();
  if (provider === 'MOCK') return 0;

  const promptTokens = Math.max(0, Number.isFinite(input.promptTokens) ? input.promptTokens : 0);
  const completionTokens = Math.max(0, Number.isFinite(input.completionTokens) ? input.completionTokens : 0);
  if (promptTokens === 0 && completionTokens === 0) return 0;

  const model = normalizeModel(input.model);
  const rate =
    RATES_USD_PER_MTOK[model] ??
    // Embedding-like models are cheap; the conservative chat default
    // would overstate them, so treat unknown non-chat models with the
    // embedding rate when they look like embedders.
    (model.includes('embedding') ? RATES_USD_PER_MTOK['text-embedding-3-small'] : DEFAULT_CHAT_RATE);

  const inputCost = (promptTokens / 1_000_000) * rate.input;
  const outputCost = (completionTokens / 1_000_000) * rate.output;
  return inputCost + outputCost;
}
