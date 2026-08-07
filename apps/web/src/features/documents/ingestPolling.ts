/*
 * BUG FIX (#94, 2026-08-06 — the "Indexing…" badge could claim progress
 * FOREVER and the page polled every 5s forever): ledger #15's pending
 * branch assumed "the pending window is seconds". That premise dies when
 * the ingestion queue is down, Redis is unreachable (enqueue threw; the
 * catch-and-log paths in document.service swallow it), or the BullMQ job
 * exhausted its 3 attempts on an unexpected throw — every one of those
 * leaves Document.ingestStatus permanently NULL, so the badge kept
 * promising "Ingestion queued — will join AI search shortly" and the
 * Documents page kept a 5s refetch loop burning for a state that can
 * never resolve (17,280 requests/day per open tab).
 *
 * These pure helpers bound the pending claim to real elapsed time. The
 * server-side row's `updatedAt` IS the enqueue instant for every pending
 * row (a fresh upload creates the row; restoreVersion and every mutation
 * stamp updatedAt; a terminal ingestion pass sets ingestStatus, ending
 * "pending"), so age is measured from server truth, never from when the
 * tab happened to open. Past the limit the page stops polling and the
 * badge switches to the honest "Indexing overdue" (it still does not
 * claim failure — a slow-but-alive job may yet land, and the copy says
 * exactly that).
 */

/**
 * Rows on the Documents page are plain API payloads; only the fields the
 * pending contract reads are declared here.
 */
export interface IngestPendingRow {
  ingestStatus?: string | null;
  ingestEligible?: boolean;
  updatedAt?: string | null;
  createdAt?: string | null;
}

/**
 * How long a pending row may claim "Indexing…" before the claim is no
 * longer justified. 5 minutes covers the worst honest case — 250k chars
 * (the AI_RAG_MAX_CHARS_PER_DOC cap) at ~300 chunks × provider latency,
 * plus queue-wait margin — without pretending to know a job died (that
 * truth lives in the jobs dashboard; this bound only stops the lying
 * copy and the infinite poll burn).
 */
export const INGEST_PENDING_LIMIT_MS = 5 * 60 * 1000;

/** The poll cadence while at least one pending row is still fresh. */
export const INGEST_POLL_INTERVAL_MS = 5000;

/** The ledger #15 pending predicate, kept verbatim: awaiting first pass. */
export const isIngestPending = (row: IngestPendingRow): boolean =>
  !row.ingestStatus && row.ingestEligible === true;

/**
 * Server-side instant the current pending window started, or null when
 * the payload carries no parseable timestamp (pre-#15 payload shapes —
 * the caller must then treat the row as overdue rather than guess an
 * age, because the fresh/overdue distinction is exactly the feature).
 * `updatedAt` is the enqueue instant (see header); `createdAt` is the
 * fallback for hypothetical payloads missing updatedAt.
 */
export const ingestPendingStartedAtMs = (row: IngestPendingRow): number | null => {
  const raw = row.updatedAt ?? row.createdAt ?? null;
  if (typeof raw !== 'string' || raw.length === 0) return null;
  const ms = Date.parse(raw);
  return Number.isNaN(ms) ? null : ms;
};

/**
 * True when a pending row has outlived the honest pending claim. A row
 * that is not pending is never overdue. A pending row with no usable
 * start timestamp is overdue: without a server start time there is no
 * evidence the claim "queued seconds ago" is true, and showing it is
 * precisely the bug.
 */
export const isIngestPendingOverdue = (
  row: IngestPendingRow,
  nowMs: number,
): boolean => {
  if (!isIngestPending(row)) return false;
  const start = ingestPendingStartedAtMs(row);
  if (start === null) return true;
  return nowMs - start > INGEST_PENDING_LIMIT_MS;
};

/**
 * Poll decision for the Documents list query: keep the ledger #15 5s
 * cadence only while at least one pending row is still within the honest
 * window; stop entirely once every pending row is overdue (or none are
 * pending). Recovery paths (a late job landing writes ingestStatus; any
 * mutation/revalidation refetches; a fresh upload re-arms the window via
 * its own fresh updatedAt) work without the loop running.
 */
export const documentsIngestPollInterval = (
  rows: readonly IngestPendingRow[],
  nowMs: number,
): number | false =>
  rows.some((row) => isIngestPending(row) && !isIngestPendingOverdue(row, nowMs))
    ? INGEST_POLL_INTERVAL_MS
    : false;
