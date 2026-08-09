# TeamSynch AI

A production-oriented, multi-tenant SaaS workspace for projects, tasks, teams, CRM operations, documents, analytics, billing, and organization administration.

TeamSynch AI demonstrates full-stack engineering with tenant isolation, role-based authorization, secure authentication, background queues, real-time infrastructure, automated testing, and cloud deployment.

## Live Application

| Service | Address |
| --- | --- |
| Web application | https://teamsynch-ai.netlify.app |
| API service | https://teamsynch-ai.onrender.com |
| Liveness check | https://teamsynch-ai.onrender.com/api/v1/system/live |
| Readiness check | https://teamsynch-ai.onrender.com/api/v1/system/ready |
| Source code | https://github.com/akash4550/TeamSynch-AI |
| Latest release | https://github.com/akash4550/TeamSynch-AI/releases/tag/v1.0.0 |

The hosted application is a portfolio demonstration environment. Demo access is available from the repository owner on request.

## Highlights

- Multi-tenant data isolation using organization-scoped database operations
- JWT access and refresh-token authentication
- Secure HTTP-only refresh cookies
- Role-based access control and granular permission middleware
- Project and task management
- Team membership and invitation management
- CRM clients, contacts, leads, opportunities, and pipelines
- Document and calendar modules
- AI workspace assistant with retrieval-augmented generation over indexed documents
- Analytics and organization administration
- Stripe webhook verification and billing entitlement checks
- Redis and BullMQ background processing
- Socket.IO real-time infrastructure
- Structured logging and request correlation IDs
- Prometheus-compatible application metrics
- Docker-based production deployment
- Automated CI, CodeQL, unit tests, and integration tests

## Multi-Tenant Security

Every business resource is associated with an `organizationId`.

The API restricts database operations to the authenticated user's organization. Cross-tenant resource access is rejected even when a valid resource identifier from another organization is supplied.

Security-sensitive behavior is enforced by the backend rather than relying only on hidden frontend controls.

The team invitation endpoint includes integration tests that verify:

- Administrators with `TEAM.MANAGE` can retrieve invitations
- Managers without the permission receive `403 Forbidden`
- Cross-organization access returns `404 Not Found`
- Sensitive password data is not returned

## Roles and Access

| Capability | Super Admin | Admin | Manager | Employee |
| --- | :---: | :---: | :---: | :---: |
| Dashboard | Yes | Yes | Yes | Yes |
| Projects and tasks | Yes | Yes | Yes | Yes |
| Create projects | Yes | Yes | No | No |
| Teams | Yes | Yes | Yes | Yes |
| Manage teams | Yes | Yes | No | No |
| CRM workspace | Yes | Yes | Yes | Yes |
| Calendar and documents | Yes | Yes | Yes | Yes |
| Analytics | Yes | Yes | Yes | No |
| User management | Yes | Yes | No | No |
| Organization settings | Yes | Yes | No | No |
| Subscription settings | Yes | Yes | No | No |
| Audit trail | Yes | No | No | No |
| Background jobs | Yes | No | No | No |

## Technology Stack

### Frontend

- React 19
- TypeScript
- Vite
- Tailwind CSS
- TanStack Query
- Zustand
- React Router
- Socket.IO Client
- Vitest
- React Testing Library

### Backend

- Node.js
- Express
- TypeScript
- Prisma ORM
- PostgreSQL
- Redis
- BullMQ
- Socket.IO
- Zod
- Winston
- Jest

### DevOps and Security

- GitHub Actions
- CodeQL
- Docker
- Docker Compose
- Nginx
- Netlify
- Render
- Prometheus-compatible metrics
- Prisma migrations
- Dependency health checks

## Architecture

The project uses a modular-monolith backend architecture.

Typical backend modules separate:

- Routes
- Request validation
- Controllers
- Services
- Repositories
- Unit and integration tests

Application flow:

1. The React application sends HTTPS requests to the Express API.
2. Authentication is handled using access tokens and secure refresh cookies.
3. Permission middleware verifies access before controller execution.
4. Services implement business rules.
5. Repositories execute tenant-scoped Prisma queries.
6. PostgreSQL stores business data.
7. Redis supports queues and real-time infrastructure.
8. BullMQ workers process asynchronous jobs.

## Repository Structure

- `apps/api` - Express API, Prisma schema, services, workers, and tests
- `apps/web` - React and Vite frontend
- `.github/workflows` - CI and security workflows
- `scripts` - maintenance, backup, and operational scripts
- `docker-compose.yml` - local infrastructure
- `docker-compose.production.yml` - production topology
- `PRODUCTION.md` - deployment and recovery runbook
- `SECURITY.md` - vulnerability disclosure policy

## Local Development

### Prerequisites

- Node.js 22 or newer
- npm
- Git
- Docker Engine
- Docker Compose v2

### Setup

1. Clone the repository:

   `git clone https://github.com/akash4550/TeamSynch-AI.git`

2. Enter the project:

   `cd TeamSynch-AI`

3. Install dependencies:

   `npm ci`

   > Dependency hygiene (2026-08-05): the committed `package-lock.json`
   > carries hand-grafted entries — platform bindings npm's Windows lock
   > bug drops (ledger #13) and hand-verified add-ons (ledger #14). Always
   > install with `npm ci`. To ADD a dependency, do NOT run
   > `npm install <pkg> --workspace=...`: npm rewrites the ideal tree on
   > peer rules and has physically pruned `apps/web/node_modules` while
   > leaving the lock intact (verified 2026-08-05 — web toolchain died).
   > Instead: add the manifest entry, splice the resolved package entries
   > into the lock (see the graft technique used for ledger #13/#14), then
   > `npm ci` and re-run the full API + web test battery.

4. Copy the environment example:

   `cp apps/api/.env.example apps/api/.env`

5. Start PostgreSQL and Redis:

   `docker compose up -d postgres redis`

6. Generate the Prisma client:

   `npm run generate --workspace apps/api`

7. Apply the committed database migrations:

   `npm run migrate:deploy --workspace apps/api`

8. Seed demonstration data:

   `npm run seed --workspace apps/api`

   Demo sign-in:
   - Workspace ID: `d71e334f-0356-4d3b-90d0-b9cc873ffc93` (Organization: akash4550)
   - Admin Email: `akshaylakwal@gmail.com`
   - Password: `Akshay@12345678`

9. Start the development servers:

   `npm run dev`

Default development addresses:

- Web application: `http://localhost:5173`
- API service: `http://localhost:4000`

The seed command wipes **every row in every table**, then inserts demonstration data. Since 2026-08-06 (BUG FIX #107) this is enforced, not just documented: the script refuses to run when `NODE_ENV=production`, and against any non-loopback database host it exits unless you pass `SEED_CONFIRM_DATABASE=<exact database name>`. Localhost development needs no confirmation.

## Testing

Frontend typecheck:

`npm run typecheck --workspace apps/web`

Backend typecheck:

`npm run typecheck --workspace apps/api`

Frontend tests:

`npm test --workspace apps/web`

Backend unit tests (DB-free gate — no Postgres/Redis required):

`npm test --workspace apps/api`

## AI Observability

Every AI provider call (completions and embeddings) emits Prometheus
metrics (`teamsynch_ai_requests_total`,
`teamsynch_ai_request_duration_seconds`, `teamsynch_ai_tokens_total`,
`teamsynch_ai_errors_total`, `teamsynch_ai_cost_usd_total` — estimated
spend as a counter so it can be charted/alerted over time), one
structured log line per call, and an
`AIUsageLog` row correlated to the originating request via
`AIUsageLog.requestId` (HTTP `x-request-id` or the BullMQ job id).
RAG chat additionally tracks retrieval-method share and stage latency:

- `teamsynch_ai_rag_retrievals_total{retrieval_method="vector"|"text_fallback"}`
  — what share of RAG queries is served by real pgvector cosine search
  vs the lexical fallback.
- `teamsynch_ai_rag_stage_duration_seconds{kind="retrieval"|"generation"}`
  — where RAG latency goes.

All metrics are served by the existing `/metrics` endpoint (Super Admin)
and use only bounded labels. Observability is strictly non-fatal: a
metrics/logging failure never affects the AI request itself.

Provider retries are surfaced on rate-limit failures: the failure
structured log includes `retryCount` (the provider's configured retry
ceiling) and `retryAfterSeconds` (the provider's `retry-after` backoff
hint when present), so hidden SDK retries — a silent cost and latency
amplifier — become visible instead of invisible.

Estimated USD cost is written to the existing `AIUsageLog.cost` column
from provider-reported token usage (`apps/api/src/modules/ai/pricing.ts`,
per-model list-price rates with a conservative fallback). This is an
observability estimate for spend monitoring — it is not a billing
calculation, and MOCK providers estimate to 0 (no fabricated cost).

AI endpoints are rate-limited at 300 requests/15 min per client IP
(separate from the generic API budget) as an abuse/cost backstop on
token-spending routes; the per-org entitlement quota remains the primary
spending gate.

### AI usage analytics API

`GET /api/v1/analytics/ai-usage?days=30` (requires `ANALYTICS.VIEW`)
returns an org-scoped summary of `AIUsageLog` activity over the trailing
window (`days` 1–90, default 30): total/successful/failed requests,
success rate, total tokens, estimated total cost (USD, from the pricing
estimator), average latency, plus per-feature and per-provider
breakdowns. It answers "which AI features does this org actually use,
and are they healthy?" from the existing usage table — no new schema.

`GET /api/v1/system/ai-usage?days=30` (Super Admin only) is the platform
operator view: total AI spend across ALL organizations plus a
per-organization breakdown sorted by spend, so the most expensive
tenants are visible at a glance.

## RAG Evaluation

`npm run eval:rag` deterministically measures **retrieval quality** over a
small version-controlled synthetic dataset (`apps/api/src/modules/ai/evaluation/`),
without touching the production RAG pipeline:

- **Recall@K**: fraction of expected relevant chunks in the top K retrieved
  results (reported at K = 1, 3, 5).
- **MRR** (Mean Reciprocal Rank): mean over cases of `1 / rank` of the first
  relevant result (0 when none is retrieved).

The dataset is fictional TeamSynch documentation (no production data) with
hand-labeled queries, including multi-relevant and deliberate hard cases.
Ranking uses an in-memory deterministic lexical baseline — no database, no
AI provider, no API keys — so the command is offline and safe in CI. It
exits non-zero only on harness errors, not on benchmark scores.

Optional regression gate: set `RAG_EVAL_MIN_MRR` and/or
`RAG_EVAL_MIN_RECALL_AT_5` (e.g. `RAG_EVAL_MIN_MRR=0.80 npm run eval:rag`)
to fail the command when the deterministic baseline drops below the
floors — useful in CI to catch dataset or retriever regressions. The
floors are relative to this synthetic baseline, not a claim about
production retrieval quality.

### Measuring the real retrieval path (optional)

The harness ships a read-only adapter over the existing
`VectorService.similaritySearch` (pgvector cosine with the existing
lexical fallback) that implements the same retriever contract, so the
same labeled dataset can score the REAL retrieval path:

```bash
npm run eval:rag --workspace=api -- --retriever vector --organization <scratchOrgId>
```

This requires the synthetic corpus to be ingested into a scratch
organization's `DocumentEmbedding` store through the normal document
pipeline, plus a configured embedding provider — it is opt-in and never
run in CI. Retrieved rows are mapped back to the dataset's synthetic
chunk ids by exact normalized content match; nothing about production
retrieval is modified.

Backend integration suites (boot the full app; require PostgreSQL on `127.0.0.1:55433` and Redis on `127.0.0.1:56379` — see `apps/api/src/test/setup-env.ts`):

`npm run test:integration --workspace apps/api`

Complete production build:

`npm run build`

## Current Verified Baseline

The current main branch works against this verified baseline (updated 2026-08-09):

- Frontend TypeScript validation
- Backend TypeScript validation
- 147 frontend tests across 29 test files (Vitest)
- 295 backend tests across 42 test suites (Jest DB-free unit gate; includes the RAG evaluation harness suite — ledger #18)
- Team invitation and tenant-isolation security integration tests (CI)
- Full production build
- GitHub Actions CI
- CodeQL analysis
- Netlify deployment checks
- Production API liveness and readiness checks
- Production CORS preflight verification
- Netlify SPA route verification

## Recent Improvements

- Added a deterministic RAG evaluation harness (`npm run eval:rag`, ledger #18) measuring retrieval quality with Recall@K and MRR over a synthetic labeled dataset — offline, no AI provider required, runs in CI (see README RAG Evaluation section)
- Corrected frontend API response handling
- Added secure team invitation listing
- Added tenant-isolation integration tests
- Aligned navigation with backend permissions
- Restricted administrative routes by role
- Restricted project and team creation controls
- Corrected organization API endpoints
- Corrected error-page redirects
- Removed a duplicate Axios client
- Normalized empty CRM search parameters
- Corrected user and pagination response handling
- Corrected task, project, and team response handling

## Production Deployment

Production deployments must use committed Prisma migrations:

`npx prisma migrate deploy`

Do not use `prisma db push` as a production migration strategy.

The production topology supports:

- PostgreSQL
- Redis
- Migration service
- API service
- React web service
- Nginx
- Container health checks
- Restart policies
- Backup and recovery workflows

See `PRODUCTION.md` for deployment, monitoring, backup, restoration, and rollback instructions.

## Current Limitations

This repository is a portfolio-quality SaaS implementation and demonstration environment rather than a commercially operated service.

Current limitations include:

- AI, email, OAuth, Stripe, and object-storage features require valid provider configuration.
- Background workers currently execute within the API process.
- Production should use one API replica until workers are separated or leader election is implemented.
- Demonstration data may be reset.
- Public demo credentials are intentionally excluded from this README.

## Security

Never commit:

- Environment files
- Database passwords
- JWT secrets
- Stripe secrets
- OAuth secrets
- Storage credentials
- Production tokens

Do not report vulnerabilities through public GitHub issues. Follow the process in `SECURITY.md`.

## Documentation

- Production runbook: `PRODUCTION.md`
- Product vision: `PRODUCT_VISION.md`
- Architecture decision record: `ADR-001-Modular-Monolith.md`
- Security policy: `SECURITY.md`

## License

Licensed under the ISC License. See `LICENSE`.

## Author

Akshay Lakwal

GitHub: https://github.com/akash4550
