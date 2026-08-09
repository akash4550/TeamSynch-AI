/*
 * AI OBSERVABILITY METRICS (2026-08-09)
 * Prometheus metrics for AI provider traffic, recorded by AIService at
 * its single choke points (generateCompletion / generateEmbedding).
 * Reuses the shared metricsRegistry, so the existing /metrics endpoint
 * (Super Admin) exposes these automatically.
 *
 * Labels are strictly BOUNDED (feature is a small fixed set; provider is
 * the PrismaAIProvider enum; kind/result/token_type/code are fixed
 * vocabularies). NEVER add requestId / userId / organizationId /
 * errorMessage as labels — high cardinality, they belong in logs/DB.
 * Tokens are ONLY provider-reported values — never estimated; failed
 * attempts have no usage payload, so they record no token metric.
 */

import {
  Counter,
  Histogram,
} from 'prom-client';

import { metricsRegistry } from './httpMetrics';

export const AI_KINDS = ['completion', 'embedding'] as const;
export const AI_RESULTS = ['success', 'failure'] as const;
export const AI_TOKEN_TYPES = ['prompt', 'completion', 'total'] as const;

export type AIKind = typeof AI_KINDS[number];
export type AIResult = typeof AI_RESULTS[number];
export type AITokenType = typeof AI_TOKEN_TYPES[number];

/** Bounded per-request labels shared by the AI metrics. */
export interface AILabels {
  feature: string;
  provider: string;
  kind: AIKind;
}

export const aiRequestsTotal = new Counter({
  name: 'teamsynch_ai_requests_total',
  help: 'Total number of AI provider requests, by feature, provider, kind and result',
  labelNames: ['feature', 'provider', 'kind', 'result'],
  registers: [metricsRegistry],
});

export const aiRequestDurationSeconds = new Histogram({
  name: 'teamsynch_ai_request_duration_seconds',
  help: 'AI provider request duration in seconds, by feature, provider and kind',
  labelNames: ['feature', 'provider', 'kind'],
  // LLM calls are slow relative to HTTP: buckets run out to the default
  // AI_TIMEOUT_MS (30s) ceiling.
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 20, 30],
  registers: [metricsRegistry],
});

export const aiTokensTotal = new Counter({
  name: 'teamsynch_ai_tokens_total',
  help: 'Total tokens reported by the AI provider response, by token type',
  labelNames: ['feature', 'provider', 'kind', 'token_type'],
  registers: [metricsRegistry],
});

export const aiErrorsTotal = new Counter({
  name: 'teamsynch_ai_errors_total',
  help: 'Total AI provider errors, by provider error code',
  labelNames: ['feature', 'provider', 'code'],
  registers: [metricsRegistry],
});

/* ---------------- RAG retrieval observability (ledger #19) ----------------
 * Tracks which retrieval path served each RAG query and how long each RAG
 * pipeline stage took. Labels are strictly bounded: retrieval_method is
 * 'vector' | 'text_fallback', kind is 'retrieval' | 'generation'. This
 * answers "what % of RAG traffic is real pgvector vs lexical fallback"
 * and where RAG latency goes — without any request-level labels.
 */

export const RAG_RETRIEVAL_METHODS = ['vector', 'text_fallback'] as const;
export const RAG_STAGE_KINDS = ['retrieval', 'generation'] as const;

export type RagRetrievalMethod = typeof RAG_RETRIEVAL_METHODS[number];
export type RagStageKind = typeof RAG_STAGE_KINDS[number];

export const ragRetrievalsTotal = new Counter({
  name: 'teamsynch_ai_rag_retrievals_total',
  help: 'Total RAG chat retrievals, by retrieval method (vector = real pgvector cosine, text_fallback = lexical)',
  labelNames: ['retrieval_method'],
  registers: [metricsRegistry],
});

export const ragStageDurationSeconds = new Histogram({
  name: 'teamsynch_ai_rag_stage_duration_seconds',
  help: 'RAG pipeline stage duration in seconds (retrieval vs generation)',
  labelNames: ['kind'],
  // Generation can exceed 30s on slow models; keep the same ceiling as
  // the general AI duration histogram.
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 20, 30],
  registers: [metricsRegistry],
});

export function recordRagRetrieval(method: RagRetrievalMethod): void {
  ragRetrievalsTotal.inc({ retrieval_method: method });
}

export function recordRagStageDuration(
  kind: RagStageKind,
  durationSeconds: number,
): void {
  ragStageDurationSeconds.observe({ kind }, durationSeconds);
}

export function recordAIRequest(
  labels: AILabels & { result: AIResult },
): void {
  aiRequestsTotal.inc({
    feature: labels.feature,
    provider: labels.provider,
    kind: labels.kind,
    result: labels.result,
  });
}

export function recordAIRequestDurationSeconds(
  labels: AILabels,
  durationSeconds: number,
): void {
  aiRequestDurationSeconds.observe(
    {
      feature: labels.feature,
      provider: labels.provider,
      kind: labels.kind,
    },
    durationSeconds,
  );
}

export function recordAITokens(
  labels: AILabels & { tokenType: AITokenType },
  tokens: number,
): void {
  aiTokensTotal.inc(
    {
      feature: labels.feature,
      provider: labels.provider,
      kind: labels.kind,
      token_type: labels.tokenType,
    },
    tokens,
  );
}

export function recordAIError(
  feature: string,
  provider: string,
  code: string,
): void {
  aiErrorsTotal.inc({ feature, provider, code });
}

/* ---------------- AI cost observability (ledger #25) ----------------
 * Estimated USD spend as a Prometheus counter so spend can be charted
 * and alerted on over time (rate() of the counter), complementing the
 * AIUsageLog.cost column and the analytics endpoints. Values come from
 * the same pricing estimator and are estimates, not billing. MOCK
 * providers estimate 0 and record nothing.
 */

export const aiCostUsdTotal = new Counter({
  name: 'teamsynch_ai_cost_usd_total',
  help: 'Estimated USD spend on AI provider calls, by feature, provider and kind',
  labelNames: ['feature', 'provider', 'kind'],
  registers: [metricsRegistry],
});

export function recordAICostUsd(
  labels: AILabels,
  costUsd: number,
): void {
  if (!Number.isFinite(costUsd) || costUsd <= 0) return;
  aiCostUsdTotal.inc(
    {
      feature: labels.feature,
      provider: labels.provider,
      kind: labels.kind,
    },
    costUsd,
  );
}

