-- FEATURE (ledger #15 — 2026-08-05): Document ingestion-status columns
-- (ingestStatus / ingestedAt / ingestReason) powering the Documents UI
-- "AI Search" badge. Hand-authored per repo convention (no shadow DB in
-- this environment); schema.prisma is the source of truth
-- (`npx prisma validate` green); apply with `npx prisma migrate deploy`.
-- Every statement is idempotent: safe on fresh and existing databases.
--
-- BACKFILL DECISION (honesty): rows uploaded before outcome tracking
-- shipped never ran a tracked pass, so they are stamped 'not_processed'
-- with an explanatory reason instead of being left NULL — under the badge
-- mapping, NULL + ingest-eligible renders "Indexing…", which would be a
-- PERMANENT lie for rows that nothing is queued for. 'not_processed'
-- renders honest guidance: re-upload to index.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'DocumentIngestStatus') THEN
    CREATE TYPE "DocumentIngestStatus" AS ENUM ('ingested', 'partial_budget', 'skipped', 'not_processed');
  END IF;
END
$$;

ALTER TABLE "Document"
  ADD COLUMN IF NOT EXISTS "ingestStatus" "DocumentIngestStatus",
  ADD COLUMN IF NOT EXISTS "ingestedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "ingestReason" TEXT;

-- Backfill: only rows no real ingestion pass has ever touched. Re-running
-- this migration can never clobber a real outcome (the WHERE clause
-- excludes anything a processor has since written).
UPDATE "Document"
SET "ingestStatus" = 'not_processed',
    "ingestReason" = 'uploaded before ingestion tracking existed'
WHERE "ingestStatus" IS NULL;
