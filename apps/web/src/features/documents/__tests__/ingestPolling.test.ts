import { describe, expect, test } from 'vitest';

import {
  INGEST_PENDING_LIMIT_MS,
  INGEST_POLL_INTERVAL_MS,
  documentsIngestPollInterval,
  ingestPendingStartedAtMs,
  isIngestPending,
  isIngestPendingOverdue,
} from '../ingestPolling';

/*
 * BUG FIX (#94 — 2026-08-06): pins for the bounded pending claim. Before
 * this, a permanently stuck ingestion (queue down, enqueue swallowed, job
 * dead after retries) left the badge promising "Indexing…" forever AND
 * kept the Documents page polling every 5s forever. These pins freeze:
 *   - the pending predicate is byte-identical to ledger #15's;
 *   - age is measured from the SERVER row timestamp (updatedAt first,
 *     createdAt fallback), never from wall-clock tab-open time;
 *   - exactly AT the limit a row is still fresh; 1ms past it, overdue;
 *   - a pending row with no usable timestamp is overdue (the fresh claim
 *     is unprovable — claim nothing);
 *   - terminal/non-eligible rows are never pending, never overdue;
 *   - the poll interval keeps ledger #15's 5s cadence while any pending
 *     row is fresh, and stops (false) as soon as only overdue pending
 *     rows remain (overdue rows re-arm polling only when a genuinely
 *     fresh pending row shows up).
 */

const NOW = Date.parse('2026-08-06T12:00:00.000Z');
const FRESH = new Date(NOW - 60_000).toISOString(); // 1 minute old
const STALE = new Date(NOW - 60 * 60_000).toISOString(); // 1 hour old

describe('ingestPolling predicates (BUG FIX #94)', () => {
  test('pending predicate matches the ledger #15 contract exactly', () => {
    expect(
      isIngestPending({ ingestStatus: null, ingestEligible: true }),
    ).toBe(true);
    expect(isIngestPending({ ingestEligible: true })).toBe(true); // absent status == awaiting first pass
    expect(
      isIngestPending({ ingestStatus: 'ingested', ingestEligible: true }),
    ).toBe(false);
    expect(
      isIngestPending({ ingestStatus: 'skipped', ingestEligible: true }),
    ).toBe(false);
    expect(isIngestPending({ ingestStatus: null, ingestEligible: false })).toBe(false);
    expect(isIngestPending({})).toBe(false);
  });

  test('start time prefers updatedAt, falls back to createdAt, and rejects garbage', () => {
    expect(
      ingestPendingStartedAtMs({ updatedAt: '2026-08-06T10:00:00.000Z', createdAt: '2026-08-01T00:00:00.000Z' }),
    ).toBe(Date.parse('2026-08-06T10:00:00.000Z'));
    expect(ingestPendingStartedAtMs({ createdAt: '2026-08-01T00:00:00.000Z' })).toBe(
      Date.parse('2026-08-01T00:00:00.000Z'),
    );
    expect(ingestPendingStartedAtMs({ updatedAt: 'not-a-date' })).toBeNull();
    expect(ingestPendingStartedAtMs({})).toBeNull();
  });

  test('fresh pending rows are not overdue; at the limit boundary still fresh; 1ms past → overdue', () => {
    const atLimit = new Date(NOW - INGEST_PENDING_LIMIT_MS).toISOString();
    const pastLimit = new Date(NOW - INGEST_PENDING_LIMIT_MS - 1).toISOString();
    expect(
      isIngestPendingOverdue({ ingestStatus: null, ingestEligible: true, updatedAt: FRESH }, NOW),
    ).toBe(false);
    expect(
      isIngestPendingOverdue({ ingestStatus: null, ingestEligible: true, updatedAt: atLimit }, NOW),
    ).toBe(false);
    expect(
      isIngestPendingOverdue({ ingestStatus: null, ingestEligible: true, updatedAt: pastLimit }, NOW),
    ).toBe(true);
    expect(
      isIngestPendingOverdue({ ingestStatus: null, ingestEligible: true, updatedAt: STALE }, NOW),
    ).toBe(true);
  });

  test('a pending row with no usable timestamp is overdue — the fresh claim is unprovable', () => {
    expect(
      isIngestPendingOverdue({ ingestStatus: null, ingestEligible: true }, NOW),
    ).toBe(true);
    expect(
      isIngestPendingOverdue(
        { ingestStatus: null, ingestEligible: true, updatedAt: 'garbage' },
        NOW,
      ),
    ).toBe(true);
  });

  test('non-pending rows are never overdue regardless of age', () => {
    expect(
      isIngestPendingOverdue({ ingestStatus: 'ingested', ingestEligible: true, updatedAt: STALE }, NOW),
    ).toBe(false);
    expect(
      isIngestPendingOverdue({ ingestStatus: null, ingestEligible: false, updatedAt: STALE }, NOW),
    ).toBe(false);
    expect(isIngestPendingOverdue({}, NOW)).toBe(false);
  });

  test('poll interval: 5s while any pending row is fresh; false when none/overdue-only pending remain', () => {
    const freshPending = { ingestStatus: null, ingestEligible: true, updatedAt: FRESH };
    const stalePending = { ingestStatus: null, ingestEligible: true, updatedAt: STALE };
    const done = { ingestStatus: 'ingested', ingestEligible: true, updatedAt: FRESH };

    expect(documentsIngestPollInterval([], NOW)).toBe(false);
    expect(documentsIngestPollInterval([done], NOW)).toBe(false);
    expect(documentsIngestPollInterval([freshPending], NOW)).toBe(INGEST_POLL_INTERVAL_MS);
    // THE BUG: before #94 this case returned 5000 forever.
    expect(documentsIngestPollInterval([stalePending], NOW)).toBe(false);
    // Mixed: the fresh row keeps polling alive for both.
    expect(documentsIngestPollInterval([stalePending, freshPending], NOW)).toBe(
      INGEST_POLL_INTERVAL_MS,
    );
    expect(INGEST_POLL_INTERVAL_MS).toBe(5000);
    expect(INGEST_PENDING_LIMIT_MS).toBe(5 * 60 * 1000);
  });
});
