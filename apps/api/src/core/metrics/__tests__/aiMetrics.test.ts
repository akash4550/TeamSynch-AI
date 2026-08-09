/*
 * AI metrics unit tests — deterministic and offline: exercise the REAL
 * prom-client metrics and assert the shared registry's rendered output.
 * Only the four AI metrics are reset in beforeEach — the shared registry
 * itself is never cleared.
 */

import { metricsRegistry } from '../httpMetrics';
import {
  aiCostUsdTotal,
  aiErrorsTotal,
  aiRequestDurationSeconds,
  aiRequestsTotal,
  aiTokensTotal,
  ragRetrievalsTotal,
  ragStageDurationSeconds,
  recordAICostUsd,
  recordAIError,
  recordAIRequest,
  recordAIRequestDurationSeconds,
  recordAITokens,
  recordRagRetrieval,
  recordRagStageDuration,
} from '../aiMetrics';

describe('aiMetrics', () => {
  beforeEach(() => {
    aiRequestsTotal.reset();
    aiRequestDurationSeconds.reset();
    aiTokensTotal.reset();
    aiErrorsTotal.reset();
    ragRetrievalsTotal.reset();
    ragStageDurationSeconds.reset();
    aiCostUsdTotal.reset();
  });

  it('renders only bounded labels (no correlation/user/tenant labels)', async () => {
    recordAIRequest({
      feature: 'rag_query',
      provider: 'OPENAI',
      kind: 'embedding',
      result: 'success',
    });
    recordAITokens(
      { feature: 'rag_query', provider: 'OPENAI', kind: 'embedding', tokenType: 'total' },
      7,
    );
    recordAIError('rag_query', 'OPENAI', 'rate_limit');

    const output = await metricsRegistry.metrics();
    for (const metricName of [
      'teamsynch_ai_requests_total',
      'teamsynch_ai_tokens_total',
      'teamsynch_ai_errors_total',
    ]) {
      const line = output.split('\n').find((l) => l.startsWith(`${metricName}{`));
      expect(line).toBeDefined();
      // Unbounded correlation/user/tenant labels must never appear.
      expect(line).not.toContain('requestId');
      expect(line).not.toContain('userId');
      expect(line).not.toContain('organizationId');
    }
  });

  it('counts requests by result and keeps series separate', async () => {
    recordAIRequest({ feature: 'RAG_WORKSPACE_CHAT', provider: 'OPENAI', kind: 'completion', result: 'success' });
    recordAIRequest({ feature: 'RAG_WORKSPACE_CHAT', provider: 'OPENAI', kind: 'completion', result: 'success' });
    recordAIRequest({ feature: 'RAG_WORKSPACE_CHAT', provider: 'OPENAI', kind: 'completion', result: 'failure' });
    recordAIRequest({ feature: 'rag_ingest', provider: 'OPENAI', kind: 'embedding', result: 'success' });
    recordAIRequest({ feature: 'TASK_SUMMARY', provider: 'MOCK', kind: 'completion', result: 'success' });

    const output = await metricsRegistry.metrics();
    expect(output).toContain(
      'teamsynch_ai_requests_total{feature="RAG_WORKSPACE_CHAT",provider="OPENAI",kind="completion",result="success"} 2',
    );
    expect(output).toContain(
      'teamsynch_ai_requests_total{feature="RAG_WORKSPACE_CHAT",provider="OPENAI",kind="completion",result="failure"} 1',
    );
    expect(output).toContain(
      'teamsynch_ai_requests_total{feature="rag_ingest",provider="OPENAI",kind="embedding",result="success"} 1',
    );
    expect(output).toContain(
      'teamsynch_ai_requests_total{feature="TASK_SUMMARY",provider="MOCK",kind="completion",result="success"} 1',
    );
  });

  it('observes request duration into the histogram buckets', async () => {
    recordAIRequestDurationSeconds(
      { feature: 'TASK_SUMMARY', provider: 'MOCK', kind: 'completion' },
      1.5,
    );

    const output = await metricsRegistry.metrics();
    expect(output).toContain(
      'teamsynch_ai_request_duration_seconds_count{feature="TASK_SUMMARY",provider="MOCK",kind="completion"} 1',
    );
    expect(output).toContain(
      'teamsynch_ai_request_duration_seconds_sum{feature="TASK_SUMMARY",provider="MOCK",kind="completion"} 1.5',
    );
    expect(output).toContain(
      'teamsynch_ai_request_duration_seconds_bucket{le="2.5",feature="TASK_SUMMARY",provider="MOCK",kind="completion"} 1',
    );
  });

  it('accumulates provider-reported tokens by token type', async () => {
    recordAITokens(
      { feature: 'RAG_WORKSPACE_CHAT', provider: 'OPENAI', kind: 'completion', tokenType: 'prompt' },
      10,
    );
    recordAITokens(
      { feature: 'RAG_WORKSPACE_CHAT', provider: 'OPENAI', kind: 'completion', tokenType: 'prompt' },
      5,
    );
    recordAITokens(
      { feature: 'RAG_WORKSPACE_CHAT', provider: 'OPENAI', kind: 'completion', tokenType: 'completion' },
      4,
    );
    recordAITokens(
      { feature: 'RAG_WORKSPACE_CHAT', provider: 'OPENAI', kind: 'completion', tokenType: 'total' },
      19,
    );

    const output = await metricsRegistry.metrics();
    expect(output).toContain(
      'teamsynch_ai_tokens_total{feature="RAG_WORKSPACE_CHAT",provider="OPENAI",kind="completion",token_type="prompt"} 15',
    );
    expect(output).toContain(
      'teamsynch_ai_tokens_total{feature="RAG_WORKSPACE_CHAT",provider="OPENAI",kind="completion",token_type="completion"} 4',
    );
    expect(output).toContain(
      'teamsynch_ai_tokens_total{feature="RAG_WORKSPACE_CHAT",provider="OPENAI",kind="completion",token_type="total"} 19',
    );
  });

  it('counts errors by provider code', async () => {
    recordAIError('rag_query', 'OPENAI', 'rate_limit');
    recordAIError('rag_query', 'OPENAI', 'rate_limit');
    recordAIError('rag_query', 'OPENAI', 'timeout');

    const output = await metricsRegistry.metrics();
    expect(output).toContain(
      'teamsynch_ai_errors_total{feature="rag_query",provider="OPENAI",code="rate_limit"} 2',
    );
    expect(output).toContain(
      'teamsynch_ai_errors_total{feature="rag_query",provider="OPENAI",code="timeout"} 1',
    );
  });

  it('counts RAG retrievals by method (vector vs text_fallback)', async () => {
    recordRagRetrieval('vector');
    recordRagRetrieval('vector');
    recordRagRetrieval('text_fallback');

    const output = await metricsRegistry.metrics();
    expect(output).toContain(
      'teamsynch_ai_rag_retrievals_total{retrieval_method="vector"} 2',
    );
    expect(output).toContain(
      'teamsynch_ai_rag_retrievals_total{retrieval_method="text_fallback"} 1',
    );
  });

  it('observes RAG stage durations separately (retrieval vs generation)', async () => {
    recordRagStageDuration('retrieval', 0.12);
    recordRagStageDuration('generation', 3.5);

    const output = await metricsRegistry.metrics();
    expect(output).toContain(
      'teamsynch_ai_rag_stage_duration_seconds_count{kind="retrieval"} 1',
    );
    expect(output).toContain(
      'teamsynch_ai_rag_stage_duration_seconds_sum{kind="retrieval"} 0.12',
    );
    expect(output).toContain(
      'teamsynch_ai_rag_stage_duration_seconds_count{kind="generation"} 1',
    );
    expect(output).toContain(
      'teamsynch_ai_rag_stage_duration_seconds_sum{kind="generation"} 3.5',
    );
  });

  it('accumulates estimated cost by feature/provider/kind', async () => {
    recordAICostUsd({ feature: 'RAG_WORKSPACE_CHAT', provider: 'OPENAI', kind: 'completion' }, 0.5);
    recordAICostUsd({ feature: 'RAG_WORKSPACE_CHAT', provider: 'OPENAI', kind: 'completion' }, 0.25);
    recordAICostUsd({ feature: 'rag_ingest', provider: 'OPENAI', kind: 'embedding' }, 0.02);

    const output = await metricsRegistry.metrics();
    expect(output).toContain(
      'teamsynch_ai_cost_usd_total{feature="RAG_WORKSPACE_CHAT",provider="OPENAI",kind="completion"} 0.75',
    );
    expect(output).toContain(
      'teamsynch_ai_cost_usd_total{feature="rag_ingest",provider="OPENAI",kind="embedding"} 0.02',
    );
  });

  it('ignores non-positive or non-finite cost values (no series recorded)', async () => {
    recordAICostUsd({ feature: 'RAG_WORKSPACE_CHAT', provider: 'MOCK', kind: 'completion' }, 0);
    recordAICostUsd({ feature: 'RAG_WORKSPACE_CHAT', provider: 'MOCK', kind: 'completion' }, -1);
    recordAICostUsd({ feature: 'RAG_WORKSPACE_CHAT', provider: 'MOCK', kind: 'completion' }, Number.NaN);

    const output = await metricsRegistry.metrics();
    // HELP/TYPE lines may render for the registered metric, but no data
    // series must exist.
    expect(output).not.toContain('teamsynch_ai_cost_usd_total{');
  });
});
