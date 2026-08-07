export type PlanTier = 'FREE' | 'STARTER' | 'PRO' | 'BUSINESS';

export interface PlanQuotas {
  maxUsers: number;
  maxProjects: number;
  maxStorageMb: number;
  maxAiRequestsPerMonth: number;
}

export const PLAN_CONFIG: Record<string, PlanQuotas> = {
  FREE: {
    maxUsers: 5,
    maxProjects: 3,
    maxStorageMb: 500,
    maxAiRequestsPerMonth: 50,
  },
  STARTER: {
    maxUsers: 15,
    maxProjects: 15,
    maxStorageMb: 5000,
    maxAiRequestsPerMonth: 500,
  },
  PRO: {
    maxUsers: 50,
    maxProjects: 100,
    maxStorageMb: 50000,
    maxAiRequestsPerMonth: 5000,
  },
  BUSINESS: {
    maxUsers: 500,
    maxProjects: 1000,
    maxStorageMb: 500000,
    maxAiRequestsPerMonth: 50000,
  },
};

/*
 * FEATURE (ledger #11 — 2026-08-05): the price↔plan mapping, resolved from
 * operator env because price ids differ per Stripe account and per
 * test/live mode. Until this existed, every paid purchase resolved to
 * `metadata?.planTier || 'PRO'` in the webhook — BUSINESS buyers were
 * silently provisioned PRO quotas.
 *
 * Env is process-static, so the map is built once at module load; missing
 * pieces simply leave entries out (billing surfaces fail CLOSED with 503 /
 * honest 400 when they can't resolve — see StripeBillingService).
 */
const STRIPE_PRICE_ENV_KEYS: Array<[PlanTier, string]> = [
  ['STARTER', 'STRIPE_PRICE_STARTER'],
  ['PRO', 'STRIPE_PRICE_PRO'],
  ['BUSINESS', 'STRIPE_PRICE_BUSINESS'],
];

const priceToPlan: Record<string, PlanTier> = {};
const planToPrice: Partial<Record<PlanTier, string>> = {};
for (const [plan, envKey] of STRIPE_PRICE_ENV_KEYS) {
  const priceId = process.env[envKey]?.trim();
  if (priceId) {
    priceToPlan[priceId] = plan;
    planToPrice[plan] = priceId;
  }
}

/** Whether operator price mapping exists at all (503 vs 400 decision). */
export const hasStripePriceMapping = (): boolean => Object.keys(priceToPlan).length > 0;

/** Stripe price id → plan tier; null when unmapped. */
export const planForStripePrice = (priceId: string | undefined | null): PlanTier | null =>
  priceId ? priceToPlan[priceId] ?? null : null;

/** Plan tier → configured Stripe price id; null when not configured. */
export const stripePriceForPlan = (plan: PlanTier): string | null => planToPrice[plan] ?? null;

/** Runtime guard: a metadata planTier string that is actually a known tier. */
export const isPlanTier = (value: unknown): value is PlanTier =>
  typeof value === 'string' && value in PLAN_CONFIG;
