import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';

import {
  IngestStatusBadge,
  ingestBadgePresentation,
} from '../IngestStatusBadge';

/*
 * FEATURE (ledger #15 — 2026-08-05): pins for the Documents-page "AI
 * Search" ingestion badge. The value of the badge is that it NEVER
 * lies — these pins freeze the exact label/tooltip contract per state:
 *   - success shows Indexed (reason-less);
 *   - partial/skip surface their reason in the tooltip, paired with the
 *     last-run timestamp (a skip's time can never read as "indexed at");
 *   - null status separates "awaiting ingestion" (→ Indexing…) from
 *     "format can never ingest" (→ Not indexable);
 *   - the pre-#15 backfill marker gives re-upload guidance;
 *   - unknown/absent payload renders NOTHING rather than guessing.
 */

describe('ingestBadgePresentation (ledger #15)', () => {
  test('ingested → Indexed (emerald), no reason, last-run line present only with a timestamp', () => {
    const view = ingestBadgePresentation({
      ingestStatus: 'ingested',
      ingestedAt: '2026-08-05T10:00:00.000Z',
      ingestReason: null,
    })!;
    expect(view.label).toBe('Indexed');
    expect(view.tone).toBe('emerald');
    expect(view.title).toContain('indexed for AI search');
    expect(view.title).toContain('Last ingestion run:');
    expect(view.title).not.toContain('Reason:');
  });

  test('partial_budget → Partially indexed (amber) with the budget reason in the tooltip', () => {
    const view = ingestBadgePresentation({
      ingestStatus: 'partial_budget',
      ingestReason: 'monthly RAG token budget reached (4999900/5000000)',
      ingestedAt: '2026-08-05T10:00:00.000Z',
    })!;
    expect(view.label).toBe('Partially indexed');
    expect(view.tone).toBe('amber');
    expect(view.title).toContain('Only part');
    expect(view.title).toContain('4999900/5000000');
  });

  test('skipped → Not indexed with the honest reason in the tooltip', () => {
    const view = ingestBadgePresentation({
      ingestStatus: 'skipped',
      ingestReason: 'no extractor for this format',
    })!;
    expect(view.label).toBe('Not indexed');
    expect(view.title).toContain('Reason: no extractor for this format');
    expect(view.title).not.toContain('Indexing');
  });

  test('not_processed (pre-#15 backfill) → guidance instead of a bare negative', () => {
    const view = ingestBadgePresentation({ ingestStatus: 'not_processed' })!;
    expect(view.label).toBe('Not indexed');
    expect(view.title).toContain('re-upload');
    expect(view.title).toContain('before ingestion tracking existed');
  });

  test('null status + eligible → Indexing… (blue, pending)', () => {
    const view = ingestBadgePresentation({
      ingestStatus: null,
      ingestEligible: true,
    })!;
    expect(view.label).toBe('Indexing\u2026');
    expect(view.tone).toBe('blue');
  });

  test('null status + ineligible format → Not indexable (never "Indexing…")', () => {
    const view = ingestBadgePresentation({
      ingestStatus: null,
      ingestEligible: false,
    })!;
    expect(view.label).toBe('Not indexable');
    expect(view.title).toContain('file type');
  });

  test('null status + unknown eligibility → renders NOTHING (no guessing)', () => {
    expect(ingestBadgePresentation({ ingestStatus: null })).toBeNull();
  });

  test('unknown future status → renders NOTHING (never mislabels)', () => {
    expect(ingestBadgePresentation({ ingestStatus: 'quantum' })).toBeNull();
  });
});

describe('IngestStatusBadge component', () => {
  test('renders the label and full honest tooltip for a skipped document', () => {
    render(
      <IngestStatusBadge
        doc={{
          ingestStatus: 'skipped',
          ingestReason: 'monthly RAG token budget exhausted (5000000/5000000)',
        }}
      />,
    );
    const badge = screen.getByRole('status');
    expect(badge).toHaveTextContent('Not indexed');
    expect(badge.getAttribute('title')).toContain('budget exhausted');
  });

  test('renders nothing for an unknown payload shape', () => {
    const { container } = render(<IngestStatusBadge doc={{}} />);
    expect(container.firstChild).toBeNull();
  });
});

/*
 * BUG FIX (#94 — 2026-08-06): the expired-pending branch. A pending row
 * past the honest window (see ingestPolling.ts) stops promising "queued —
 * will join shortly" and admits overdue-with-repair-path. The branch must
 * (a) only ever fire for the null+eligible state, (b) never rewrite a
 * terminal outcome, and (c) leave the default (no flag) byte-identical to
 * the ledger #15 contract.
 */
describe('ingestBadgePresentation — pendingExpired (BUG FIX #94)', () => {
  const pending = { ingestStatus: null as string | null, ingestEligible: true };

  test('pending + expired → "Indexing overdue" (amber), honest may-still-complete tooltip', () => {
    const view = ingestBadgePresentation(pending, { pendingExpired: true })!;
    expect(view.label).toBe('Indexing overdue');
    expect(view.tone).toBe('amber');
    expect(view.icon).toBe('alert');
    expect(view.title).toContain('may still complete');
    expect(view.title).toContain('Refresh this page to check');
    expect(view.title).toContain('documents queue');
    // must not fabricate a death certificate or a measured duration
    expect(view.title).not.toContain('failed');
    expect(view.title).not.toMatch(/\d+ (minute|second|hour)/);
  });

  test('pending + NOT expired → unchanged ledger #15 "Indexing…" claim', () => {
    const view = ingestBadgePresentation(pending, { pendingExpired: false })!;
    expect(view.label).toBe('Indexing…');
    expect(view.tone).toBe('blue');
    expect(view.icon).toBe('clock');
  });

  test('default (no options) is byte-identical to the pre-#94 contract', () => {
    expect(ingestBadgePresentation(pending)!.label).toBe('Indexing…');
  });

  test('expired flag can never rewrite a terminal outcome', () => {
    expect(
      ingestBadgePresentation({ ingestStatus: 'ingested', ingestEligible: true }, { pendingExpired: true })!.label,
    ).toBe('Indexed');
    expect(
      ingestBadgePresentation({ ingestStatus: 'skipped', ingestReason: 'r', ingestEligible: true }, { pendingExpired: true })!.label,
    ).toBe('Not indexed');
    expect(
      ingestBadgePresentation({ ingestStatus: null, ingestEligible: false }, { pendingExpired: true })!.label,
    ).toBe('Not indexable');
  });

  test('component renders the overdue badge when the page passes the flag', () => {
    render(<IngestStatusBadge doc={pending} pendingExpired />);
    const badge = screen.getByRole('status');
    expect(badge).toHaveTextContent('Indexing overdue');
    expect(badge.getAttribute('title')).toContain('may still complete');
  });
});
