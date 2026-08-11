# LLMOps: RAG, Observability, Evaluation, and Cost Control

> Status: current as of 2026-08-10. This document describes the production
> LLM/AI stack in TeamSynch — the pipeline, how it is observed, how
> retrieval quality is measured, and how spend is controlled.

## 1. The RAG pipeline

```
User question (web chat)
  -> POST /api/v1/ai/rag/ask   (auth + RBAC AI.USE + entitlement gate + rate limit)
  -> RAGService.askRAGQuestion
       -> VectorService.similaritySearch
            - pgvector cosine search over DocumentEmbedding (vector(1536))
            - lexical fallback (pg_trgm word_similarity, then ILIKE) when
              pgvector is unavailable; distances are NULL there — the UI
              shows "text match", never a fabricated percentage
       -> AIService.generateCompletion (feature 'RAG_WORKSPACE_CHAT')
  -> answer + citations (documentId, snippet, relevanceScore)
```

Document ingestion: upload → text extraction (PDF/DOCX/PPTX/XLSX/DOC) →
chunking (`chunkText`, 1000 chars / 200 overlap) → embedding
(text-embedding-3-small) → `DocumentEmbedding` rows, with a per-org
**monthly token budget** gate (`AI_RAG_MONTHLY_TOKEN_BUDGET`, default 5M
tokens ≈ $0.10) enforced in the ingestion worker.

## 2. Observability

Every AI provider call flows through `AIService.generateCompletion` /
`generateEmbedding` — the single instrumentation choke point:

| Signal | Where |
| --- | --- |
| Prometheus metrics | `teamsynch_ai_requests_total{feature,provider,kind,result}`, `teamsynch_ai_request_duration_seconds{feature,provider,kind}`, `teamsynch_ai_tokens_total{feature,provider,kind,token_type}`, `teamsynch_ai_errors_total{feature,provider,code}`, `teamsynch_ai_cost_usd_total{feature,provider,kind}`, `teamsynch_ai_rag_retrievals_total{retrieval_method}`, `teamsynch_ai_rag_stage_duration_seconds{kind}` — served by the Super-Admin `/metrics` endpoint |
| Structured logs | one `ai.call.completed` / `ai.call.failed` line per call: event, correlationId, feature, provider, model, kind, latencyMs, tokens; failures add providerCode, providerRequestId, retryAfterSeconds. No prompts, content, or secrets. |
| Request correlation | `AIUsageLog.requestId` = HTTP `x-request-id` (sync paths) or BullMQ `job.id` (async jobs) — the TeamSynch correlation id; the provider's own request id stays in the failure log as `providerRequestId` |
| Database | `AIUsageLog` row per call: org, user, provider, model, tokens, estimated cost, latency, success/error, feature, correlation id |
| Retry telemetry | rate-limit failures surface `retryCount` (the SDK's configured ceiling) and `retryAfterSeconds` (the provider's `retry-after` hint) |
| RAG stage timing | retrieval vs generation split per RAG chat request + the retrieval-method share (real pgvector vs lexical fallback) |

Observability is **strictly non-fatal**: metrics/logging failures are
warn-only and can never break an AI request.

## 3. Evaluation

`npm run eval:rag` measures **retrieval quality** deterministically and
offline over a version-controlled synthetic dataset
(`apps/api/src/modules/ai/evaluation/`):

- **Recall@K** — fraction of expected relevant chunks in the top K
  retrieved results (reported at K = 1, 3, 5).
- **MRR** — mean reciprocal rank of the first relevant result.
- Metrics are pure functions (`metrics.ts`, zero imports); retrievers
  plug in via a small interface — the default is an in-memory lexical
  baseline (offline, CI-safe), and an optional read-only pgvector
  adapter scores the real retrieval path when a scratch corpus is
  ingested.
- A CI regression gate (`RAG_EVAL_MIN_MRR` / `RAG_EVAL_MIN_RECALL_AT_5`)
  fails the build only if the deterministic baseline drops below the
  documented floors — floors are relative to the synthetic baseline,
  never a claim about production quality.

## 4. Cost control & analytics

| Control | Detail |
| --- | --- |
| Entitlement quota | `checkEntitlement('AI_REQUEST')` — per-plan monthly request cap (FREE 50, STARTER 500, PRO 5000, BUSINESS 50000), 403 at the boundary |
| RAG token budget | per-org monthly embedding budget in the ingestion worker |
| Rate limiting | AI endpoints: 300 req/15min per IP (before auth), separate from the generic API budget |
| Cost estimation | `pricing.ts` — per-model list-price rates from provider-reported tokens; written to `AIUsageLog.cost` and the Prometheus spend counter (estimates, not billing) |
| Analytics APIs | org-scoped (`/api/v1/analytics/ai-usage`) with per-feature / per-provider / per-user breakdowns; platform-wide Super-Admin view (`/api/v1/system/ai-usage`) |

## 5. Design principles

- **Single choke points** — all AI traffic goes through `AIService`;
  instrumentation, correlation, and cost all attach there.
- **Honest data** — tokens come only from provider responses, distances
  only from real pgvector, costs only from the estimator; mock provider
  never fabricates embeddings or cost.
- **Bounded cardinality** — Prometheus labels are fixed vocabularies
  (feature, provider, kind, result, token_type, code); never request/
  user/org ids.
- **Non-fatal observability** — nothing in the observability path can
  affect the AI request it observes.
- **Small, revertible increments** — every capability above landed as an
  independent PR with tests, CI, and a documented rollback.
