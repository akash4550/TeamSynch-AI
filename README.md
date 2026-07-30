# 🚀 TeamSynch AI

A Production-Grade, Multi-Tenant Enterprise SaaS Platform

TeamSynch AI is an intelligent, multi-tenant business operating system built for small and mid-sized teams (5–100 employees). It unifies Project Execution, Task Management, CRM Pipelines, Document Management, Real-Time Collaboration, AI Intelligence, and Automated Compliance into a single operational workspace.

---

## 🏗️ Architectural Topology

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 1. EXPERIENCE LAYER                                                         │
│ React 19, TypeScript, Vite, Tailwind CSS, Tremor, TanStack Query, Zustand   │
│ Code-Split Routes (React.lazy), Virtualized 60fps Lists, Optimistic UI      │
├─────────────────────────────────────────────────────────────────────────────┤
│ 2. BUSINESS DOMAIN LAYER (MODULAR MONOLITH)                                │
│ Organizations, Users, Teams, Projects, Tasks, CRM, Documents, Analytics     │
│ Granular RBAC Policy Engine, Extended BaseTenantRepository, Cursor Queries  │
├─────────────────────────────────────────────────────────────────────────────┤
│ 3. INTELLIGENCE & AUTOMATION LAYER                                         │
│ PostgreSQL pgvector RAG Engine, Yjs CRDT Engine, BullMQ Background Queue   │
│ Two-Way Calendar Sync, AES-256 Token Encryption, Stripe Billing Webhooks   │
├─────────────────────────────────────────────────────────────────────────────┤
│ 4. INFRASTRUCTURE & PLATFORM LAYER                                          │
│ Docker Rootless Multi-Stage Container, PostgreSQL 15, Redis 7, Nginx       │
│ Prometheus Observability Metrics, Signal Graceful Shutdown (SIGTERM)       │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## ✨ Core Enterprise Features

### 1. 🔐 Multi-Tenant Security & Isolation
- **Schema-Level Isolation:** Database queries and mutations are strictly scoped by `organizationId`.
- **Extended Tenant Repository:** `BaseTenantRepository<T>` and custom Prisma extensions automatically enforce soft-deletes (`deletedAt: null`) and compound tenant keys (`{ id, organizationId }`).
- **AES-256-GCM Encryption:** Third-party OAuth tokens (Google Calendar, Microsoft Outlook) are encrypted at rest using AES-256-GCM prior to storage.
- **Granular RBAC Engine:** Policy engine (`hasPermission`) evaluates static role entitlements and user-level custom permission overrides (e.g., `crm.manage_pipeline`, `document.delete`, `analytics.view`).

### 2. ⚡ Real-Time Collaboration & CRDT Editor
- **Yjs CRDT Engine:** Concurrent document edits are merged using Yjs operational transformation state vectors rather than destructive raw string overwrites.
- **ProseMirror / TipTap Editor:** Rich-text editor with live collaborator awareness cursors, user colors, and reconnection indicators.
- **Socket.IO Room Isolation:** Real-time event broadcasts are isolated to tenant-scoped WebSocket rooms (`org_{organizationId}`).

### 3. 🧠 AI pgvector RAG & Semantic Search
- **PostgreSQL pgvector Integration:** Document chunks and project notes are indexed into 1536-dimensional vector embeddings using HNSW / IVFFlat cosine distance indexing (`vector_cosine_ops`).
- **Asynchronous Vector Worker:** Document uploading triggers background text chunking (1000-char windows) and embedding generation via BullMQ `aiEmbeddingQueue`.
- **RAG Workspace Chat:** Natural language query interface (`/ai-chat`) returning synthesized answers with cited document source snippets and relevance match percentages.
- **Native Full-Text Search:** Global command palette (`Cmd+K`) queries Projects, Tasks, CRM, and Documents using PostgreSQL `websearch_to_tsquery` and `to_tsvector`.

### 4. 💳 Commercial Billing & Compliance Audit
- **Stripe Webhook Signature Verification:** Webhook endpoints process raw request `Buffer` payloads with official HMAC signature verification (`stripe.webhooks.constructEvent`).
- **Plan Entitlement Gatekeeper:** Middleware (`requireEntitlement`) inspects subscription status (`ACTIVE`, `PAST_DUE`, `CANCELED`) and quota limits (`maxUsers`, `maxProjects`, `maxStorageMb`, `maxAiRequestsPerMonth`).
- **Immutable Security Audit Trail:** System activity logs capture user actions, IP addresses, and user-agent metadata with cursor pagination and asynchronous CSV/JSON export workers.

---

## 🛠️ Technology Stack

- **Backend:** Node.js 22, Express, TypeScript 5, Prisma ORM, BullMQ, ioredis, Winston, Zod
- **Database & Storage:** PostgreSQL 15 (`pgvector`), Redis 7, AWS S3 / MinIO Object Storage
- **Realtime & CRDT:** Socket.IO 4, Yjs, y-websocket, `@tiptap/react`
- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS, Tremor, TanStack Query v5, Zustand, `@tanstack/react-virtual`
- **DevOps:** Docker (Rootless Multi-Stage), GitHub Actions CI/CD, Prometheus Metrics, Trivy Security Scanner

---

## 🚀 Quick Start (Local Development)

### Prerequisites
- Node.js 22+
- Docker Engine & Docker Compose v2
- Git

### 1. Clone & Install
```bash
git clone https://github.com/akash4550/TeamSynch-AI.git
cd TeamSynch-AI
npm install
```

### 2. Start Infrastructure (PostgreSQL & Redis)
```bash
docker compose up -d postgres redis
```

### 3. Database Setup & Local Sync
```bash
# Generate Prisma Client
npm run generate

# Apply Local Database Schema & Seed Initial Data
npm run db:push -w apps/api
npm run seed -w apps/api
```

### 4. Run Development Servers
```bash
npm run dev
```
- **Frontend Web App:** `http://localhost:5173`
- **API Server:** `http://localhost:4000`
- **Swagger Documentation:** `http://localhost:4000/api/v1/docs`

---

## 🧪 Testing & Code Quality

```bash
# Typecheck Entire Workspace (tsc --noEmit)
npm run typecheck

# Run Web Unit Tests (Vitest)
npm run test -w apps/web

# Run API Unit Tests (Jest)
npm run test -w apps/api

# Execute Integration Tests Against Ephemeral Services
npm run test:integration
```

---

## 📦 Production Deployment

Production deployments MUST run `npx prisma migrate deploy` rather than `db:push` to apply committed database schema migrations deterministically.

### 1. Build Production Container
```bash
cp .env.production.example .env.production
docker compose -f docker-compose.production.yml up -d --build
```

### 2. Health & Readiness Probes
- **Liveness Probe:** `GET /api/v1/system/live`
- **Readiness Probe:** `GET /api/v1/system/ready` (Validates live PostgreSQL & Redis pings)
- **Metrics Endpoint:** `GET /api/v1/system/metrics` (Prometheus format)

---

## 📄 Documentation
- [Product Vision & Roadmap](PRODUCT_VISION.md)
- [Production Runbook](PRODUCTION.md)
- [Architecture Decision Record (ADR-001)](ADR-001-Modular-Monolith.md)
- [Security Policy](SECURITY.md)

---

## 📄 License
This project is licensed under the [ISC License](LICENSE).
