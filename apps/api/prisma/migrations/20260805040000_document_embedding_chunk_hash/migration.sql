-- FEATURE (ledger #16 — 2026-08-05): DocumentEmbedding.chunkHash —
-- sha256 hex of contentChunk, the lookup key for zero-spend chunk reuse
-- (byte-identical chunks are re-pointed / copy-inserted instead of being
-- re-embedded). Hand-authored per repo convention (no shadow DB in this
-- environment); schema.prisma is the source of truth
-- (`npx prisma validate` green); apply with `npx prisma migrate deploy`.
-- Every statement is idempotent: safe on fresh and existing databases.
--
-- BACKFILL: existing rows get their hash computed in-database with
-- pgcrypto's digest() — byte-identical strings hash identically to the
-- Node sha256 hex the writer (VectorService.chunkContentHash) produces,
-- so old rows join the reuse pool without re-embedding.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE "DocumentEmbedding"
  ADD COLUMN IF NOT EXISTS "chunkHash" TEXT;

-- Backfill only rows no hash was ever written for (re-runnable).
UPDATE "DocumentEmbedding"
SET "chunkHash" = encode(digest("contentChunk", 'sha256'), 'hex')
WHERE "chunkHash" IS NULL;

CREATE INDEX IF NOT EXISTS "DocumentEmbedding_organizationId_chunkHash_idx"
  ON "DocumentEmbedding" ("organizationId", "chunkHash");
