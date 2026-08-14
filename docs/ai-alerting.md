# AI Alerting Guide

> How to operationalize the AI observability metrics. The API exposes the
> metrics below on the Super-Admin `/metrics` endpoint (Prometheus text
> format); this guide gives ready-to-use PromQL alert rules. None of
> these rules are deployed by default — wire them into your Prometheus
> (or Grafana Managed Alerts) instance.

## Metrics reference

| Metric | Labels | Meaning |
| --- | --- | --- |
| `teamsynch_ai_requests_total` | feature, provider, kind, result | AI provider calls (success/failure) |
| `teamsynch_ai_request_duration_seconds` | feature, provider, kind | AI call latency histogram |
| `teamsynch_ai_tokens_total` | feature, provider, kind, token_type | Provider-reported tokens |
| `teamsynch_ai_errors_total` | feature, provider, code | Errors by provider code (rate_limit, timeout, connection_error, ...) |
| `teamsynch_ai_cost_usd_total` | feature, provider, kind | Estimated spend counter |
| `teamsynch_ai_rag_retrievals_total` | retrieval_method | RAG queries by method (vector / text_fallback) |
| `teamsynch_ai_rag_stage_duration_seconds` | kind | RAG stage latency (retrieval / generation) |

## Alert rules (PromQL)

```yaml
groups:
  - name: teamsynch-ai
    rules:
      # 1. AI error rate spike: > 20% of AI calls failing for 10 minutes.
      - alert: AIHighErrorRate
        expr: |
          sum(rate(teamsynch_ai_requests_total{result="failure"}[10m]))
            / clamp_min(sum(rate(teamsynch_ai_requests_total[10m])), 1)
          > 0.2
        for: 10m
        labels: { severity: warning }
        annotations:
          summary: "AI error rate above 20% ({{ $value | humanizePercentage }})"

      # 2. Provider rate-limit storm: sustained 429s.
      - alert: AIRateLimitStorm
        expr: |
          sum(rate(teamsynch_ai_errors_total{code="rate_limit"}[15m])) > 0.5
        for: 15m
        labels: { severity: warning }
        annotations:
          summary: "Sustained AI rate limiting — check quota / backoff"

      # 3. RAG silently falling back to lexical search.
      #    If text_fallback becomes most of traffic, pgvector may be down.
      - alert: AIRAGFallbackDominant
        expr: |
          sum(rate(teamsynch_ai_rag_retrievals_total{retrieval_method="text_fallback"}[15m]))
            / clamp_min(sum(rate(teamsynch_ai_rag_retrievals_total[15m])), 1)
          > 0.5
        for: 15m
        labels: { severity: warning }
        annotations:
          summary: "Over 50% of RAG queries served by lexical fallback"

      # 4. Spend spike: estimated cost more than 3x the same hour yesterday.
      - alert: AICostSpike
        expr: |
          sum(increase(teamsynch_ai_cost_usd_total[1h]))
            > 3 * sum(increase(teamsynch_ai_cost_usd_total[1h] offset 24h))
        for: 10m
        labels: { severity: warning }
        annotations:
          summary: "AI spend spike detected ({{ $value | humanize }} USD this hour)"

      # 5. RAG generation latency degradation: p95 above 30s for 10m.
      - alert: AIRAGGenerationSlow
        expr: |
          histogram_quantile(0.95,
            sum by (le) (rate(teamsynch_ai_rag_stage_duration_seconds_bucket{kind="generation"}[10m])))
          > 30
        for: 10m
        labels: { severity: warning }
        annotations:
          summary: "RAG generation p95 above 30s"

      # 6. Token spend growing without a corresponding request increase
      #    (e.g. prompt bloat, runaway retries).
      - alert: AITokensPerRequestRising
        expr: |
          sum(increase(teamsynch_ai_tokens_total{token_type="total"}[1h]))
            / clamp_min(sum(increase(teamsynch_ai_requests_total[1h])), 1)
          > 5000
        for: 1h
        labels: { severity: info }
        annotations:
          summary: "Average tokens per AI request above 5000"
```

## Notes

- **Cost is an estimate** (from provider-reported tokens × list prices), not billing — treat the cost alert as a directional signal.
- **Error-rate and latency alerts** use the standard `rate()`/`histogram_quantile()` patterns and only fire on sustained (10m+) conditions to avoid noise.
- The fallback-dominant alert is the highest-value production check: a pgvector outage degrades RAG silently by design (honest lexical fallback), so this is the tripwire.
- Set the RAG evaluation CI gate (`RAG_EVAL_MIN_MRR` / `RAG_EVAL_MIN_RECALL_AT_5`) as a complementary *offline* regression check; these PromQL rules are the *online* complement.
