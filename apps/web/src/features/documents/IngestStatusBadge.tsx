import type { FC } from 'react';
import { AlertTriangle, CheckCircle2, Clock3, MinusCircle } from 'lucide-react';

/*
 * FEATURE (ledger #15 — 2026-08-05): the "AI Search" ingestion badge.
 * Before this, the Documents page implied nothing about RAG visibility —
 * a user could upload a scanned PDF or exhaust the monthly token budget
 * and still assume the assistant "knew" the file (dishonest-by-omission).
 * The API now persists every terminal ingestion outcome onto the document
 * row (Document.ingestStatus / ingestedAt / ingestReason); this badge
 * renders it with three hard honesty rules:
 *   1. The label says ONLY what is true; everything else lives in the
 *      tooltip (reason + last-run timestamp, paired so a skip's time can
 *      never read as "indexed at").
 *   2. null status distinguishes "awaiting ingestion" (eligible →
 *      "Indexing…"; the page polls until it resolves) from "format can
 *      never be indexed" (→ "Not indexable") — never both as one vague
 *      gray blob.
 *   3. Unknown/absent payload shape renders NOTHING rather than guessing.
 */

export interface IngestBadgeDoc {
  ingestStatus?: string | null;
  ingestReason?: string | null;
  ingestedAt?: string | null;
  ingestEligible?: boolean;
}

export type IngestBadgeTone = 'emerald' | 'amber' | 'slate' | 'blue';
export type IngestBadgeIcon = 'check' | 'alert' | 'clock' | 'minus';

export interface IngestBadgeView {
  label: string;
  title: string;
  tone: IngestBadgeTone;
  icon: IngestBadgeIcon;
}

const lastRunLine = (doc: IngestBadgeDoc): string =>
  doc.ingestedAt
    ? `\nLast ingestion run: ${new Date(doc.ingestedAt).toLocaleString()}`
    : '';

/*
 * BUG FIX (#94 — 2026-08-06): `options.pendingExpired` marks a pending
 * (null-status, eligible) row whose server-side pending window has
 * outlived INGEST_PENDING_LIMIT_MS in ingestPolling.ts. Without it the
 * badge promised "queued — will join shortly" FOREVER on a permanently
 * stuck job (queue down / attempts exhausted). The expired branch claims
 * only what is true — overdue, may STILL complete, how to check/repair —
 * and never touches terminal statuses. Optional with a false default so
 * the ledger #15 contract (and every existing caller/pin) is unchanged.
 */
export const ingestBadgePresentation = (
  doc: IngestBadgeDoc,
  options?: { pendingExpired?: boolean },
): IngestBadgeView | null => {
  switch (doc.ingestStatus ?? null) {
    case 'ingested':
      return {
        label: 'Indexed',
        title: `This document is indexed for AI search.${lastRunLine(doc)}`,
        tone: 'emerald',
        icon: 'check',
      };
    case 'partial_budget':
      return {
        label: 'Partially indexed',
        title: `Only part of this document is indexed for AI search.\n${
          doc.ingestReason ?? 'The monthly AI ingestion budget was reached.'
        }${lastRunLine(doc)}`,
        tone: 'amber',
        icon: 'alert',
      };
    case 'skipped':
      return {
        label: 'Not indexed',
        title: `This document is not part of AI search.\nReason: ${
          doc.ingestReason ?? 'unknown'
        }${lastRunLine(doc)}`,
        tone: 'slate',
        icon: 'alert',
      };
    case 'not_processed':
      // #15 backfill marker — guidance instead of a bare negative.
      return {
        label: 'Not indexed',
        title:
          'Uploaded before ingestion tracking existed — re-upload the file to index it for AI search.',
        tone: 'slate',
        icon: 'minus',
      };
    case null: {
      // BUG FIX (#94 — 2026-08-06): an expired pending claim stops
      // promising "queued". Copy names no duration it cannot prove (a
      // missing timestamp is overdue-by-design) and never claims the job
      // died — a slow-but-alive run may still land; the user is told how
      // to refresh and what the repair path is.
      if (doc.ingestEligible === true && options?.pendingExpired === true) {
        return {
          label: 'Indexing overdue',
          title:
            'Ingestion is taking longer than expected — it may still complete. ' +
            'Refresh this page to check. ' +
            'If it stays stuck, re-upload the file or ask an administrator ' +
            'to retry the documents queue.',
          tone: 'amber',
          icon: 'alert',
        };
      }
      if (doc.ingestEligible === false) {
        return {
          label: 'Not indexable',
          title: 'This file type cannot be text-indexed for AI search.',
          tone: 'slate',
          icon: 'minus',
        };
      }
      if (doc.ingestEligible === true) {
        return {
          label: 'Indexing\u2026',
          title: 'Ingestion queued — this document will join AI search shortly.',
          tone: 'blue',
          icon: 'clock',
        };
      }
      // Older payload shape (pre-#15 API): claim nothing.
      return null;
    }
    default:
      // Unknown status string from the future: never guess-mislabel.
      return null;
  }
};

const TONE_CLASSES: Record<IngestBadgeTone, string> = {
  emerald:
    'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-900/50',
  amber:
    'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-900/50',
  slate:
    'bg-gray-50 text-gray-600 border-gray-200 dark:bg-slate-800 dark:text-gray-300 dark:border-slate-700',
  /*
   * UI PASS (#UI-documents, 2026-08-07): the 'blue' tone (live indexing)
   * now renders with the app's primary accent tokens instead of raw blue-*;
   * tone NAME/'blue' in the type is unchanged so the presentation contract
   * and every caller stay byte-compatible. emerald/amber/slate untouched.
   */
  blue:
    'bg-primary-50 text-primary-700 border-primary-200 dark:bg-primary-900/20 dark:text-primary-300 dark:border-primary-900/50',
};

const ICONS: Record<IngestBadgeIcon, typeof CheckCircle2> = {
  check: CheckCircle2,
  alert: AlertTriangle,
  clock: Clock3,
  minus: MinusCircle,
};

export const IngestStatusBadge: FC<{
  doc: IngestBadgeDoc;
  /* BUG FIX (#94): page-computed overdue flag; default false = the
   * pre-#94 presentation, so every existing mount is byte-compatible. */
  pendingExpired?: boolean;
}> = ({ doc, pendingExpired }) => {
  const view = ingestBadgePresentation(doc, { pendingExpired });
  if (!view) return null;
  const Icon = ICONS[view.icon];
  return (
    <span
      role="status"
      title={view.title}
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${TONE_CLASSES[view.tone]}`}
    >
      <Icon className="h-3 w-3" aria-hidden />
      {view.label}
    </span>
  );
};
