-- FEATURE (ledger #9 — 2026-08-05): pgvector storage for the real RAG
-- ingestion pipeline (DocumentEmbedding). Hand-authored per repo
-- convention (no shadow DB in this environment); schema.prisma is the
-- source of truth (`npx prisma validate` green); apply with
-- `npx prisma migrate deploy` on any pgvector-enabled Postgres (the
-- docker-compose postgres service is pgvector/pgvector:0.8.5-pg15-bookworm).
--
-- RECONCILIATION NOTE: this table was historically created OUTSIDE the
-- schema by 20260730000000_add_pgvector_hnsw_index (raw table + hnsw/org
-- indexes, no FKs / searchText / trigram index). Every statement below is
-- therefore idempotent so `migrate deploy` succeeds on BOTH fresh
-- databases and ones that already ran 0730: columns/constraints/indexes it
-- already has are skipped, the missing ones are added.

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- CreateTable (fresh DBs; 0730-upgraded DBs skip via IF NOT EXISTS)
CREATE TABLE IF NOT EXISTS "DocumentEmbedding" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "documentId" TEXT,
    "taskId" TEXT,
    "projectId" TEXT,
    "contentChunk" TEXT NOT NULL,
    "embedding" vector(1536),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentEmbedding_pkey" PRIMARY KEY ("id")
);

-- pg-generated tsvector over the chunk for ranked lexical fallback
-- (updates automatically with contentChunk; absent on 0730 tables).
ALTER TABLE "DocumentEmbedding"
    ADD COLUMN IF NOT EXISTS "searchText" tsvector
    GENERATED ALWAYS AS (to_tsvector('english', "contentChunk")) STORED;

-- CreateIndex (vector): HNSW needs no training rows (unlike IVFFlat); the
-- name matches the 0730 index, so IF NOT EXISTS reconciles cleanly.
CREATE INDEX IF NOT EXISTS "DocumentEmbedding_embedding_hnsw_idx" ON "DocumentEmbedding"
    USING hnsw ("embedding" vector_cosine_ops);

-- CreateIndex (lexical fallbacks + tenant filters)
CREATE INDEX IF NOT EXISTS "DocumentEmbedding_contentChunk_idx" ON "DocumentEmbedding"
    USING GIN ("contentChunk" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "DocumentEmbedding_searchText_gin_idx" ON "DocumentEmbedding"
    USING GIN ("searchText");
CREATE INDEX IF NOT EXISTS "DocumentEmbedding_organizationId_idx" ON "DocumentEmbedding" ("organizationId");
CREATE INDEX IF NOT EXISTS "DocumentEmbedding_documentId_idx" ON "DocumentEmbedding" ("documentId");

-- AddForeignKey (tenant cascade; document cascade covers hard-delete
-- sweeps). ADD CONSTRAINT has no IF NOT EXISTS — guard via pg_constraint.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'DocumentEmbedding_organizationId_fkey'
    ) THEN
        ALTER TABLE "DocumentEmbedding" ADD CONSTRAINT "DocumentEmbedding_organizationId_fkey"
            FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'DocumentEmbedding_documentId_fkey'
    ) THEN
        ALTER TABLE "DocumentEmbedding" ADD CONSTRAINT "DocumentEmbedding_documentId_fkey"
            FOREIGN KEY ("documentId") REFERENCES "Document"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
