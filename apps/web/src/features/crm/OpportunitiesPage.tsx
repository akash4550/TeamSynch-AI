import { useState } from 'react';
import { PlusIcon, MagnifyingGlassIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import {
  useOpportunities,
  useCreateOpportunity,
  useLeads,
  usePipelineStages,
  type Opportunity,
} from './hooks/useCRMQueries';

/*
 * UI PASS (#UI-opportunities, 2026-08-06): visual-only redesign, same
 * design language as #UI-clients / #UI-contacts / #UI-leads (page-local;
 * no shared component touched). Tremor's internal utilities are
 * node_modules-only classes which Tailwind v4 excludes from scanning — see
 * the foundation note in features/crm/ClientsPage.tsx. ALL state vars,
 * hooks, handlers, query params, cell logic (lead-title fallback to
 * `Deal #<id>`, stage fallback, `probability ?? stage.probability ?? 0`,
 * revenue formatting and truthiness rules), and every behavioural branch
 * copy are preserved verbatim.
 */

/* Muted em dash: the consistent "no value" affordance (decorative only). */
const EmptyCell = () => (
  <span aria-hidden="true" className="text-gray-400 dark:text-gray-500">
    —
  </span>
);

const labelClass = 'mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300';
const inputClass =
  'h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 shadow-sm placeholder:text-gray-500 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/40 dark:border-slate-600 dark:bg-slate-700 dark:text-white dark:placeholder:text-gray-400';

export const OpportunitiesPage = () => {
  const [search, setSearch] = useState('');
  const [formError, setFormError] = useState<string | null>(null); // inline create-form failure (Bug #27)
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Form State
  const [leadId, setLeadId] = useState('');
  const [stageId, setStageId] = useState('');
  const [expectedRevenue, setExpectedRevenue] = useState<number | undefined>();
  const [probability, setProbability] = useState<number>(50);

  const [page, setPage] = useState(1);
  /*
   * BUG FIX (records silently hidden): previously `useOpportunities({ search })`
   * sent no pagination params — the API defaults to limit=10, so every
   * opportunity past the first 10 was unreachable and there were no pagination
   * controls.
   */
  const limit = 10;
  /*
   * BUG FIX (read-side lie — failed GET rendered a fake empty state): this
   * query exposed only `isLoading`, so a rejected GET /crm/opportunities
   * fell through to `opportunities.length === 0` and the table claimed
   * "No opportunities found. Click \"Add Opportunity\" to create one." —
   * telling the user their deals were wiped when the server had simply
   * failed. Now surfaces an honest failure row (server message + Retry)
   * before the empty/success branches; the paginator is hidden on failure.
   * Same pattern as Bug #31/#32.
   */
  const { data: oppsData, isLoading, isError, error: opportunitiesError, refetch } = useOpportunities({ search, page, limit });
  // FEATURE (ledger #6): dropdown feeds off the raised 500 aggregate cap
  // (was 100); truncation beyond it is declared next to the select.
  const { data: leadsData } = useLeads({ limit: 500 });

  const opportunitiesErrorMessage = (() => {
    const m = (opportunitiesError as any)?.response?.data?.error?.message;
    return typeof m === 'string' && m.length > 0 ? m : null;
  })();
  const { data: stages } = usePipelineStages();
  const createOpportunityMutation = useCreateOpportunity();

  const opportunities = oppsData?.data || [];
  const total = oppsData?.total || 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const leads = leadsData?.data || [];

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!leadId || !stageId) return;
    setFormError(null); // clear the previous failure so a retry reports fresh state

    createOpportunityMutation.mutate(
      { leadId, stageId, expectedRevenue, probability },
      {
        onSuccess: () => {
          setIsModalOpen(false);
          setFormError(null);
          setLeadId('');
          setStageId('');
          setExpectedRevenue(undefined);
          setProbability(50);
        },
        // BUG FIX (silent create failures — CRM class): rejections used to
        // leave the modal frozen with no feedback; now surfaced inline from
        // the shared `{ error: { message } }` envelope (string-only).
        onError: (error: any) => {
          const apiMessage = error?.response?.data?.error?.message;
          setFormError(
            typeof apiMessage === 'string' && apiMessage.length > 0
              ? apiMessage
              : 'Failed to create the opportunity. Please check the details and try again.'
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
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Opportunities</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Manage active sales deals in your pipeline.
          </p>
        </div>
        <Button onClick={() => setIsModalOpen(true)} className="shrink-0 gap-2 self-start sm:self-auto">
          <PlusIcon className="h-4 w-4" aria-hidden="true" />
          Add Opportunity
        </Button>
      </div>

      {/* Search — programmatically labelled; icon optically centred; h-10 control height */}
      <div className="mb-6 w-full max-w-sm">
        <label htmlFor="opportunity-search" className="sr-only">
          Search opportunities
        </label>
        <div className="relative">
          <MagnifyingGlassIcon
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500"
            aria-hidden="true"
          />
          <input
            id="opportunity-search"
            type="text"
            placeholder="Search opportunities..."
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
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50/75 dark:border-slate-700 dark:bg-slate-800/80">
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Opportunity / Lead Title
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Pipeline Stage
                </th>
                <th scope="col" className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Probability
                </th>
                <th scope="col" className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Expected Revenue
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Created Date
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
                      Loading opportunities...
                    </div>
                  </td>
                </tr>
              ) : isError ? (
                // Honest failure row — never render the "No opportunities found"
                // empty state when the GET actually failed (see query comment above).
                <tr>
                  <td colSpan={5} className="px-4 py-8">
                    <div
                      role="alert"
                      className="mx-auto max-w-md rounded-lg border border-red-200 bg-red-50 px-4 py-6 text-center dark:border-red-900/50 dark:bg-red-900/20"
                    >
                      <p className="text-sm font-medium text-red-700 dark:text-red-300">
                        We couldn't load your opportunities
                      </p>
                      <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                        {opportunitiesErrorMessage ?? 'Something went wrong while fetching your opportunities. Your data is safe — please try again.'}
                      </p>
                      <Button size="sm" className="mt-4" onClick={() => refetch()}>
                        Retry
                      </Button>
                    </div>
                  </td>
                </tr>
              ) : opportunities.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-sm text-gray-500 dark:text-gray-400">
                    No opportunities found. Click "Add Opportunity" to create one.
                  </td>
                </tr>
              ) : (
                opportunities.map((opp: Opportunity) => (
                  <tr
                    key={opp.id}
                    className="transition-colors hover:bg-gray-50 dark:hover:bg-slate-700/40"
                  >
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">
                      {opp.lead?.title || `Deal #${opp.id.slice(0, 6)}`}
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">
                      {opp.stage?.name ? opp.stage.name : <EmptyCell />}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-600 dark:text-gray-300">
                      {opp.probability ?? opp.stage?.probability ?? 0}%
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-600 dark:text-gray-300">
                      {opp.expectedRevenue ? `$${Number(opp.expectedRevenue).toLocaleString()}` : <EmptyCell />}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-gray-600 dark:text-gray-300">
                      {new Date(opp.createdAt).toLocaleDateString()}
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
          Showing page {page} of {totalPages} ({total} {total === 1 ? 'opportunity' : 'opportunities'})
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

      {/* Add Opportunity Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-opportunity-title"
            className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-slate-800"
          >
            <h3 id="add-opportunity-title" className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
              Add Opportunity
            </h3>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label htmlFor="opportunity-lead" className={labelClass}>
                  Select Lead *
                </label>
                <select
                  id="opportunity-lead"
                  required
                  autoFocus
                  value={leadId}
                  onChange={(e) => setLeadId(e.target.value)}
                  className={inputClass}
                >
                  <option value="">Select Lead...</option>
                  {leads.map((lead) => (
                    <option key={lead.id} value={lead.id}>{lead.title}</option>
                  ))}
                </select>
                {/* FEATURE (ledger #6 — truncation honesty): the picker
                    lists the fetched page; a 501st+ lead must not
                    masquerade as nonexistent. */}
                {(leadsData?.total ?? 0) > leads.length && (
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Showing the first {leads.length} of {leadsData?.total} leads.
                  </p>
                )}
              </div>
              <div>
                <label htmlFor="opportunity-stage" className={labelClass}>
                  Pipeline Stage *
                </label>
                <select
                  id="opportunity-stage"
                  required
                  value={stageId}
                  onChange={(e) => setStageId(e.target.value)}
                  className={inputClass}
                >
                  <option value="">Select Stage...</option>
                  {stages?.map((stage) => (
                    <option key={stage.id} value={stage.id}>{stage.name} ({stage.probability}%)</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="opportunity-revenue" className={labelClass}>
                  Expected Revenue ($)
                </label>
                <input
                  id="opportunity-revenue"
                  type="number"
                  min="0"
                  value={expectedRevenue || ''}
                  onChange={(e) => setExpectedRevenue(e.target.value ? Number(e.target.value) : undefined)}
                  className={inputClass}
                  placeholder="50000"
                />
              </div>
              <div>
                <label htmlFor="opportunity-probability" className={labelClass}>
                  Win Probability (%)
                </label>
                <input
                  id="opportunity-probability"
                  type="number"
                  min="0"
                  max="100"
                  value={probability}
                  onChange={(e) => setProbability(Number(e.target.value))}
                  className={inputClass}
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
                <Button type="submit" isLoading={createOpportunityMutation.isPending}>
                  Save Deal
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
