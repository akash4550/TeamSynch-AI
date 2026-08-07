import { useState } from 'react';
import { PlusIcon, MagnifyingGlassIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { useLeads, useCreateLead, type Lead } from './hooks/useCRMQueries';

/*
 * UI PASS (#UI-leads, 2026-08-06): visual-only redesign, same design
 * language as #UI-clients / #UI-contacts (page-local; no shared component
 * touched). Tremor's internal utilities are node_modules-only classes
 * which Tailwind v4 excludes from scanning — see the foundation note in
 * features/crm/ClientsPage.tsx. ALL state vars, hooks, handlers, query
 * params, status semantics (NEW/CONTACTED/QUALIFIED/CONVERTED hues map
 * 1:1 to the old Tremor Badge colors), value formatting
 * ($toLocaleString, same truthiness rules), and every behavioural branch
 * copy are preserved verbatim.
 */

/* Muted em dash: the consistent "no value" affordance (decorative only). */
const EmptyCell = () => (
  <span aria-hidden="true" className="text-gray-400 dark:text-gray-500">
    —
  </span>
);

/*
 * Status pill — SAME semantic mapping as the old getStatusBadgeColor
 * (NEW→blue, CONTACTED→amber, QUALIFIED→emerald, CONVERTED→indigo,
 * unknown→gray), now with compiled theme-aware WCAG-AA tokens.
 */
const statusPillClass: Record<string, string> = {
  NEW: 'bg-blue-50 text-blue-700 ring-blue-600/20 dark:bg-blue-400/10 dark:text-blue-300 dark:ring-blue-400/20',
  CONTACTED: 'bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-400/10 dark:text-amber-300 dark:ring-amber-400/20',
  QUALIFIED: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-400/10 dark:text-emerald-300 dark:ring-emerald-400/20',
  CONVERTED: 'bg-indigo-50 text-indigo-700 ring-indigo-600/20 dark:bg-indigo-400/10 dark:text-indigo-300 dark:ring-indigo-400/20',
};
const defaultPillClass =
  'bg-gray-100 text-gray-600 ring-gray-500/10 dark:bg-slate-700/50 dark:text-gray-300 dark:ring-slate-500/30';

const StatusPill = ({ status }: { status: string }) => (
  <span
    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${statusPillClass[status] ?? defaultPillClass}`}
  >
    {status}
  </span>
);

const labelClass = 'mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300';
const inputClass =
  'h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 shadow-sm placeholder:text-gray-500 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/40 dark:border-slate-600 dark:bg-slate-700 dark:text-white dark:placeholder:text-gray-400';

export const LeadsPage = () => {
  const [search, setSearch] = useState('');
  const [formError, setFormError] = useState<string | null>(null); // inline create-form failure (Bug #27)
  const [page, setPage] = useState(1);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Form State
  const [title, setTitle] = useState('');
  const [source, setSource] = useState('');
  const [score, setScore] = useState(50);
  const [expectedValue, setExpectedValue] = useState<number | undefined>();

  /*
   * BUG FIX (records silently hidden): previously `useLeads({ search })` sent
   * no pagination params — the API defaults to limit=10, so every lead past
   * the first 10 was unreachable and there were no pagination controls.
   * Page/limit are now explicit, the footer uses the API's `total`, and page
   * resets to 1 whenever the search changes.
   */
  const limit = 10;
  /*
   * BUG FIX (read-side lie — failed GET rendered a fake empty state): this
   * query exposed only `isLoading`, so a rejected GET /crm/leads fell
   * through to `leads.length === 0` and the table claimed "No leads found.
   * Click \"Add Lead\" to create one." — telling the user their pipeline
   * was wiped (and nudging them to create duplicates) when the server had
   * simply failed. Now surfaces an honest failure row (server message +
   * Retry) before the empty/success branches; the paginator is hidden on
   * failure since there is no honest page/total. Same as Bug #31/#32.
   */
  const { data, isLoading, isError, error: leadsError, refetch } = useLeads({ search, page, limit });
  const createLeadMutation = useCreateLead();

  const leadsErrorMessage = (() => {
    const m = (leadsError as any)?.response?.data?.error?.message;
    return typeof m === 'string' && m.length > 0 ? m : null;
  })();

  const leads = data?.data || [];
  const total = data?.total || 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setFormError(null); // clear the previous failure so a retry reports fresh state

    createLeadMutation.mutate(
      { title, source, score, expectedValue },
      {
        onSuccess: () => {
          setIsModalOpen(false);
          setFormError(null);
          setTitle('');
          setSource('');
          setScore(50);
          setExpectedValue(undefined);
        },
        // BUG FIX (silent create failures — CRM class): rejections used to
        // leave the modal frozen with no feedback; now surfaced inline from
        // the shared `{ error: { message } }` envelope (string-only).
        onError: (error: any) => {
          const apiMessage = error?.response?.data?.error?.message;
          setFormError(
            typeof apiMessage === 'string' && apiMessage.length > 0
              ? apiMessage
              : 'Failed to create the lead. Please check the details and try again.'
          );
        },
      }
    );
  };

  return (
    <div className="p-6 h-full overflow-auto bg-gray-50 dark:bg-gray-900">
      {/* Page header — aligned title cluster; exactly one primary action */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Leads</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Track and qualify inbound sales prospects.
          </p>
        </div>
        <Button onClick={() => setIsModalOpen(true)} className="shrink-0 gap-2 self-start sm:self-auto">
          <PlusIcon className="h-4 w-4" aria-hidden="true" />
          Add Lead
        </Button>
      </div>

      {/* Search — programmatically labelled; icon optically centred; h-10 control height */}
      <div className="mb-6 w-full max-w-sm">
        <label htmlFor="lead-search" className="sr-only">
          Search leads
        </label>
        <div className="relative">
          <MagnifyingGlassIcon
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500"
            aria-hidden="true"
          />
          <input
            id="lead-search"
            type="text"
            placeholder="Search leads..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1); // new search must restart from page 1
            }}
            className={inputClass}
          />
        </div>
      </div>

      {/* Table surface — horizontal scroll is contained INSIDE the card on small screens */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50/75 dark:border-slate-700 dark:bg-slate-800/80">
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Title / Prospect
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Source
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Lead Score
                </th>
                <th scope="col" className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Expected Value
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-slate-700/70">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10">
                    <div
                      role="status"
                      className="flex items-center justify-center gap-2 text-sm text-gray-500 dark:text-gray-400"
                    >
                      <ArrowPathIcon className="h-4 w-4 animate-spin" aria-hidden="true" />
                      Loading leads...
                    </div>
                  </td>
                </tr>
              ) : isError ? (
                // Honest failure row — never render the "No leads found" empty
                // state when the GET actually failed (see query comment above).
                <tr>
                  <td colSpan={5} className="px-4 py-8">
                    <div
                      role="alert"
                      className="mx-auto max-w-md rounded-lg border border-red-200 bg-red-50 px-4 py-6 text-center dark:border-red-900/50 dark:bg-red-900/20"
                    >
                      <p className="text-sm font-medium text-red-700 dark:text-red-300">
                        We couldn't load your leads
                      </p>
                      <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                        {leadsErrorMessage ?? 'Something went wrong while fetching your leads. Your data is safe — please try again.'}
                      </p>
                      <Button size="sm" className="mt-4" onClick={() => refetch()}>
                        Retry
                      </Button>
                    </div>
                  </td>
                </tr>
              ) : leads.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-sm text-gray-500 dark:text-gray-400">
                    No leads found. Click "Add Lead" to create one.
                  </td>
                </tr>
              ) : (
                leads.map((lead: Lead) => (
                  <tr
                    key={lead.id}
                    className="transition-colors hover:bg-gray-50 dark:hover:bg-slate-700/40"
                  >
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">{lead.title}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">
                      {lead.source ? lead.source : <EmptyCell />}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-gray-600 dark:text-gray-300">{lead.score} / 100</td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-600 dark:text-gray-300">
                      {lead.expectedValue ? `$${Number(lead.expectedValue).toLocaleString()}` : <EmptyCell />}
                    </td>
                    <td className="px-4 py-3">
                      <StatusPill status={lead.status} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Pagination — uses the API's `total` (previously discarded). Hidden on
          query failure: with no response there is no honest page/total to show. */}
      {!isError && (
      <div className="mt-4 flex items-center justify-between gap-4">
        <span className="text-sm text-gray-500 dark:text-gray-400" aria-live="polite">
          Showing page {page} of {totalPages} ({total} {total === 1 ? 'lead' : 'leads'})
        </span>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            aria-label="Go to previous page"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
          >
            Previous
          </Button>
          <Button
            size="sm"
            variant="outline"
            aria-label="Go to next page"
            onClick={() => setPage((p) => p + 1)}
            disabled={page >= totalPages}
          >
            Next
          </Button>
        </div>
      </div>
      )}

      {/* Add Lead Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-lead-title"
            className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-slate-800"
          >
            <h3 id="add-lead-title" className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
              Add New Lead
            </h3>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label htmlFor="lead-title" className={labelClass}>
                  Lead Title / Subject *
                </label>
                <input
                  id="lead-title"
                  type="text"
                  required
                  autoFocus
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className={inputClass}
                  placeholder="Website Redesign Prospect - Globex"
                />
              </div>
              <div>
                <label htmlFor="lead-source" className={labelClass}>
                  Lead Source
                </label>
                <input
                  id="lead-source"
                  type="text"
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  className={inputClass}
                  placeholder="Inbound Form / LinkedIn / Cold Outreach"
                />
              </div>
              <div>
                <label htmlFor="lead-score" className={labelClass}>
                  Score (0-100)
                </label>
                <input
                  id="lead-score"
                  type="number"
                  min="0"
                  max="100"
                  value={score}
                  onChange={(e) => setScore(Number(e.target.value))}
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="lead-expected-value" className={labelClass}>
                  Expected Value ($)
                </label>
                <input
                  id="lead-expected-value"
                  type="number"
                  min="0"
                  value={expectedValue || ''}
                  onChange={(e) => setExpectedValue(e.target.value ? Number(e.target.value) : undefined)}
                  className={inputClass}
                  placeholder="25000"
                />
              </div>
              {formError && (
                <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-400">
                  {formError}
                </p>
              )}
              <div className="flex justify-end gap-3 border-t border-gray-100 pt-4 dark:border-slate-700">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setIsModalOpen(false);
                    setFormError(null);
                  }}
                >
                  Cancel
                </Button>
                <Button type="submit" isLoading={createLeadMutation.isPending}>
                  Save Lead
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
