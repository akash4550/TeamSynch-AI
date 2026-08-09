/*
 * AI USAGE ANALYTICS SERVICE (ledger #21 — 2026-08-09)
 * -----------------------------------------------------
 * Read-only, org-scoped summary of AIUsageLog activity over a trailing
 * window. Answers operational questions that Prometheus cannot: "which
 * AI feature does this org use most?", "what is the success rate?",
 * "how many tokens per feature?", "average latency per feature?".
 *
 * Tenant isolation: every query is filtered by the authenticated
 * organizationId — cross-tenant rows are never visible, matching the
 * analytics module's existing org-scoped contract.
 *
 * Pure aggregation over the existing AIUsageLog table; no new schema.
 */

import { prisma } from '../../config/prisma';
import { AI_USAGE_DEFAULT_DAYS, AI_USAGE_MAX_DAYS } from './ai-usage.dto';

export interface AIUsageFeatureStats {
  feature: string;
  requests: number;
  successes: number;
  failures: number;
  totalTokens: number;
  totalCostUsd: number;
  averageLatencyMs: number | null;
}

export interface AIUsageProviderStats {
  provider: string;
  requests: number;
  successes: number;
  failures: number;
}

export interface AIUsageSummary {
  organizationId: string;
  periodDays: number;
  periodStart: string;
  periodEnd: string;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  successRate: number;
  totalTokens: number;
  // Estimated USD spend over the period (from AIUsageLog.cost, populated
  // by the pricing estimator — observability estimate, not billing).
  totalCostUsd: number;
  averageLatencyMs: number | null;
  requestsByFeature: AIUsageFeatureStats[];
  requestsByProvider: AIUsageProviderStats[];
}

const clampDays = (days: number | undefined): number => {
  if (days === undefined) return AI_USAGE_DEFAULT_DAYS;
  if (!Number.isInteger(days)) return AI_USAGE_DEFAULT_DAYS;
  return Math.min(AI_USAGE_MAX_DAYS, Math.max(1, days));
};

/** Prisma aggregates Decimal cost as Decimal; normalize to number. */
const toNumber = (value: unknown): number => {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return value;
  if (typeof (value as { toNumber?: unknown }).toNumber === 'function') {
    return (value as { toNumber: () => number }).toNumber();
  }
  return 0;
};

export class AIUsageService {
  async getAIUsageSummary(
    organizationId: string,
    days?: number,
  ): Promise<AIUsageSummary> {
    const periodDays = clampDays(days);
    const periodEnd = new Date();
    const periodStart = new Date(
      periodEnd.getTime() - periodDays * 24 * 60 * 60 * 1000,
    );
    const where = {
      organizationId,
      createdAt: { gte: periodStart },
    };

    const [
      totals,
      totalSuccesses,
      byFeatureAll,
      byFeatureSuccess,
      byProviderAll,
      byProviderSuccess,
    ] = await Promise.all([
      prisma.aIUsageLog.aggregate({
        where,
        _count: { _all: true },
        _sum: {
          promptTokens: true,
          completionTokens: true,
          totalTokens: true,
          cost: true,
        },
        _avg: { latencyMs: true },
      }),
      prisma.aIUsageLog.count({
        where: { ...where, success: true },
      }),
      prisma.aIUsageLog.groupBy({
        by: ['feature'],
        where,
        _count: { _all: true },
        _sum: { totalTokens: true, cost: true },
        _avg: { latencyMs: true },
      }),
      prisma.aIUsageLog.groupBy({
        by: ['feature'],
        where: { ...where, success: true },
        _count: { _all: true },
      }),
      prisma.aIUsageLog.groupBy({
        by: ['provider'],
        where,
        _count: { _all: true },
      }),
      prisma.aIUsageLog.groupBy({
        by: ['provider'],
        where: { ...where, success: true },
        _count: { _all: true },
      }),
    ]);

    const successByFeature = new Map(
      byFeatureSuccess.map((row) => [
        row.feature,
        row._count._all ?? 0,
      ]),
    );
    const successByProvider = new Map(
      byProviderSuccess.map((row) => [
        row.provider,
        row._count._all ?? 0,
      ]),
    );

    const requestsByFeature: AIUsageFeatureStats[] = byFeatureAll
      .map((row) => {
        const requests = row._count._all ?? 0;
        const successes = successByFeature.get(row.feature) ?? 0;
        return {
          feature: row.feature,
          requests,
          successes,
          failures: requests - successes,
          totalTokens: row._sum.totalTokens ?? 0,
          totalCostUsd: toNumber(row._sum.cost),
          averageLatencyMs: row._avg.latencyMs ?? null,
        };
      })
      .sort((a, b) => b.requests - a.requests);

    const requestsByProvider: AIUsageProviderStats[] = byProviderAll
      .map((row) => {
        const requests = row._count._all ?? 0;
        const successes = successByProvider.get(row.provider) ?? 0;
        return {
          provider: row.provider,
          requests,
          successes,
          failures: requests - successes,
        };
      })
      .sort((a, b) => b.requests - a.requests);

    const totalRequests = totals._count._all ?? 0;

    return {
      organizationId,
      periodDays,
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      totalRequests,
      successfulRequests: totalSuccesses,
      failedRequests: totalRequests - totalSuccesses,
      successRate: totalRequests === 0 ? 0 : totalSuccesses / totalRequests,
      totalTokens: totals._sum.totalTokens ?? 0,
      totalCostUsd: toNumber(totals._sum.cost),
      averageLatencyMs: totals._avg.latencyMs ?? null,
      requestsByFeature,
      requestsByProvider,
    };
  }
}
