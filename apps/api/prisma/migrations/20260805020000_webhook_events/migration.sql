-- FEATURE (ledger #10 — 2026-08-05): webhook side-effect idempotency
-- ledger. Stripe retries non-2xx deliveries (and Dashboard replays) for up
-- to 3 days; before this table, every retry re-ran the handler's side
-- effects — duplicate SEND_BILLING_RECEIPT emails and duplicate
-- ProjectUpdated audit rows per genuine event. The (provider, eventId)
-- unique key is the atomic claim: first delivery inserts PROCESSING,
-- retries read PROCESSED (skip) or FAILED/stale-PROCESSING (guarded
-- re-claim, attempts incremented). See StripeBillingService.
-- Hand-authored per repo convention; apply with `npx prisma migrate deploy`.

-- CreateEnum
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'WebhookEventStatus') THEN
        CREATE TYPE "WebhookEventStatus" AS ENUM ('PROCESSING', 'PROCESSED', 'FAILED');
    END IF;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "WebhookEvent" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "status" "WebhookEventStatus" NOT NULL DEFAULT 'PROCESSING',
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "lastError" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: the atomic claim key (one row per provider event, ever)
CREATE UNIQUE INDEX IF NOT EXISTS "WebhookEvent_provider_eventId_key"
    ON "WebhookEvent"("provider", "eventId");

-- CreateIndex: operational scans (failed/stale re-claims, dashboards)
CREATE INDEX IF NOT EXISTS "WebhookEvent_provider_status_idx"
    ON "WebhookEvent"("provider", "status");
