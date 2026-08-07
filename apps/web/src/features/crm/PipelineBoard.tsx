import { useState } from 'react';
import { ArrowPathIcon, RectangleStackIcon } from '@heroicons/react/24/outline';
import {
  usePipelineStages,
  useOpportunities,
  useUpdateOpportunity,
  type Opportunity,
  type PipelineStage,
} from './hooks/useCRMQueries';
import { Link } from 'react-router-dom';
import { Button } from '../../components/ui/Button';

/*
 * UI PASS (#UI-pipeline-board, 2026-08-06): visual-only board restyle —
 * the final Tremor chrome remnant in the CRM cluster (Card/Title/Text/
 * Button/Badge) swapped for the same design language as the tasks board
 * (KanbanColumn/TaskCard) and the redesigned CRM lists. THIS file only.
 *
 * Behaviour preserved exactly:
 *  - Both queries, the {limit: 500} opportunities fetch, the truncation
 *    note, and the Bug #35 honest-failure contracts (read panel copy +
 *    role="alert" + Retry refetching only the failed queries; stage-move
 *    banner with the server message + "Dismiss error").
 *  - Drag & drop DOM contract pinned by PipelineBoardFailureStates: the
 *    drop target wraps the stage-name text node and the draggable wrapper
 *    wraps the deal-title text node, so bubbled drop/dragStart events
 *    resolve to the same handlers. No optimistic moves (server truth only).
 *  - All rendered copy except one micro-swap: a missing expected revenue
 *    now renders the cluster-standard muted em dash instead of 'N/A'
 *    (same truthiness rule — decorative-only change, matches the tables).
 *
 * Visual changes only: cluster header (h1 + muted description + one
 * primary action rendered as a REAL link styled like the primary button —
 * the old markup nested an interactive <button> inside an <a>), neutral
 * slate columns with the tasks-board header-band pattern, tabular-nums
 * money, primary-accent drag hover, role="status" loading, and the
 * responsive 18rem -> 20rem column width already used by the tasks board.
 */

/* Mirrors ui/Button (primary, md) for the one navigation action; keeps
 * anchor semantics (focus, href, open-in-new-tab) instead of nesting a
 * <button> inside <Link> like the old Tremor markup did. */
const primaryLinkClass =
  'inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900';

export const PipelineBoard = () => {
  /*
   * BUG FIX (fabricated empty pipeline on failed reads — Bug #35): both
   * queries surfaced only `isLoading`, so a rejected GET /crm/pipeline-stages
   * rendered "No pipeline stages defined." (the org's entire sales process
   * apparently deleted), and a rejected GET /crm/opportunities rendered
   * every stage with 0 deals, "$0" totals, and "Drop deal here" — an empty
   * pipeline, when the server had simply failed. On ANY read failure the
   * board is now replaced by an honest `role="alert"` panel (server message
   * + Retry for the failed queries) so no fabricated stage/deal data can
   * ever paint. Same truth pattern as Bug #31–#34.
   */
  const {
    data: stages,
    isLoading: isLoadingStages,
    isError: stagesIsError,
    error: stagesError,
    refetch: refetchStages,
  } = usePipelineStages();
  /*
   * BUG FIX (deals silently missing from the board): the opportunities call
   * previously passed no params, so the API default of page=1/limit=10
   * applied — with 11+ deals in the pipeline, cards, per-stage badge counts,
   * and column revenue totals were all computed from only the first 10
   * opportunities, and stages whose deals fell outside page 1 rendered as
   * empty ("Drop deal here") despite containing deals. The board needs the
   * full pipeline to be correct, so it fetches with an explicit larger limit
   * (ledger #6 raised both the API cap and this fetch to 500; truncation
   * past it is declared above the board).
   */
  const {
    data: oppsData,
    isLoading: isLoadingOpps,
    isError: oppsIsError,
    error: oppsError,
    refetch: refetchOpps,
  } = useOpportunities({ limit: 500 });
  const updateOpportunityMutation = useUpdateOpportunity();

  const pipelineReadFailed = stagesIsError || oppsIsError;
  const pipelineErrorMessage = (() => {
    for (const e of [stagesError, oppsError]) {
      const m = (e as any)?.response?.data?.error?.message;
      if (typeof m === 'string' && m.length > 0) return m;
    }
    return null;
  })();

  /*
   * BUG FIX (silent stage-move failures — Bug #35): the drop handler
   * fired PATCH /crm/opportunities/:id with NO onError, so a rejection
   * (500, tenant-scope 403, network down) was completely invisible — the
   * user dropped a deal into a new column, nothing moved, and the app
   * said nothing, looking frozen. Rejections now render this dismissible
   * banner with the server's message (no optimistic move exists, so there
   * is nothing to roll back — the board only ever shows server truth).
   */
  const [moveError, setMoveError] = useState<string | null>(null);

  const [draggedOppId, setDraggedOppId] = useState<string | null>(null);

  const opportunities = oppsData?.data || [];

  const handleDragStart = (oppId: string) => {
    setDraggedOppId(oppId);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (stageId: string) => {
    if (!draggedOppId) return;

    updateOpportunityMutation.mutate(
      {
        id: draggedOppId,
        data: { stageId },
      },
      {
        onError: (error: any) => {
          // API error envelope is `{ success: false, error: { message } }` —
          // extract the nested string only (Bug #20 pattern).
          const apiMessage = error?.response?.data?.error?.message;
          setMoveError(
            typeof apiMessage === 'string' && apiMessage.length > 0
              ? apiMessage
              : 'Failed to move the opportunity. Please try again.'
          );
        },
      }
    );

    setDraggedOppId(null);
  };

  return (
    <div className="p-6 h-full overflow-auto bg-gray-50 dark:bg-slate-900 flex flex-col">
      {/* Page header — same language as the CRM lists; one primary action,
          rendered as a real link with button styling (no nested <button>). */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between shrink-0">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Pipeline Board</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Drag and drop deals across stages in your sales pipeline.
          </p>
        </div>
        <Link to="/crm/opportunities" className={`${primaryLinkClass} self-start sm:self-auto`}>
          <RectangleStackIcon className="h-4 w-4" aria-hidden="true" />
          Manage Opportunities
        </Link>
      </div>

      {moveError && (
        // Bug #35: the dismissible surface for failed stage moves (was silent).
        <div
          role="alert"
          className="mb-4 flex items-start justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-300 shrink-0"
        >
          <span>{moveError}</span>
          <button
            onClick={() => setMoveError(null)}
            className="font-medium hover:underline"
            aria-label="Dismiss error"
          >
            ×
          </button>
        </div>
      )}

      {/* FEATURE (ledger #6 — truncation honesty): the board renders the
          fetched opportunity page (cap raised 100→500). Beyond it, say so —
          an invisible 501st deal must never masquerade as an empty column. */}
      {(oppsData?.total ?? 0) > opportunities.length && (
        <p className="mb-4 text-xs text-gray-500 dark:text-gray-400 shrink-0">
          Showing the first {opportunities.length} of {oppsData?.total} deals
          — use the Opportunities list to find anything beyond that.
        </p>
      )}

      <div className="flex-1 flex gap-4 overflow-x-auto pb-4">
        {isLoadingStages || isLoadingOpps ? (
          <div role="status" className="p-6 flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <ArrowPathIcon className="h-4 w-4 animate-spin" aria-hidden="true" />
            Loading pipeline...
          </div>
        ) : pipelineReadFailed ? (
          // Bug #35: honest failure panel — never fabricate an empty pipeline
          // ("No pipeline stages defined." / 0-deal columns) when a read failed.
          <div
            role="alert"
            className="mx-auto w-full max-w-xl self-center rounded-lg border border-red-200 bg-red-50 px-6 py-10 text-center dark:border-red-900/50 dark:bg-red-900/20"
          >
            <p className="text-sm font-medium text-red-700 dark:text-red-300">We couldn't load your pipeline</p>
            <p className="mt-1 text-sm text-red-600 dark:text-red-400">
              {pipelineErrorMessage ?? 'Something went wrong while fetching your pipeline. Your data is safe — please try again.'}
            </p>
            <Button
              size="sm"
              className="mt-4"
              onClick={() => {
                if (stagesIsError) refetchStages();
                if (oppsIsError) refetchOpps();
              }}
            >
              Retry
            </Button>
          </div>
        ) : !stages || stages.length === 0 ? (
          <div className="p-6 text-sm text-gray-500 dark:text-gray-400">No pipeline stages defined.</div>
        ) : (
          stages.map((stage: PipelineStage) => {
            const stageDeals = opportunities.filter((o: Opportunity) => o.stageId === stage.id);
            const stageValue = stageDeals.reduce((sum, o) => sum + Number(o.expectedRevenue || 0), 0);

            return (
              <div
                key={stage.id}
                onDragOver={handleDragOver}
                onDrop={() => handleDrop(stage.id)}
                className="flex w-72 sm:w-80 shrink-0 flex-col rounded-xl border border-gray-200 bg-gray-100/80 dark:border-slate-700 dark:bg-slate-800/60"
              >
                {/* Column header band — matches the tasks board language;
                    stage name stays a plain text node inside the drop target
                    (bubbled drop events resolve here — test contract). */}
                <div className="flex items-center justify-between gap-2 rounded-t-xl border-b border-inherit bg-white/60 p-3 dark:bg-slate-800/50">
                  <h3 className="min-w-0 flex-1 truncate text-xs font-semibold uppercase tracking-wider text-gray-700 dark:text-gray-300">
                    {stage.name}
                  </h3>
                  <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-xs font-semibold tabular-nums text-gray-600 ring-1 ring-gray-200 dark:bg-slate-700 dark:text-gray-300 dark:ring-slate-600">
                    {stageDeals.length}
                  </span>
                </div>
                <p className="px-3 py-2 text-xs tabular-nums text-gray-500 dark:text-gray-400">
                  ${stageValue.toLocaleString()} ({stage.probability}%)
                </p>

                <div className="flex min-h-[150px] flex-1 flex-col gap-3 overflow-y-auto p-3">
                  {stageDeals.map((opp: Opportunity) => (
                    // Draggable wrapper — must remain an ancestor of the
                    // deal-title text node (bubbled dragStart — test contract).
                    <div
                      key={opp.id}
                      draggable
                      onDragStart={() => handleDragStart(opp.id)}
                      className="cursor-grab rounded-lg border border-gray-200/80 bg-white p-3 shadow-sm transition-shadow hover:border-primary-400 hover:shadow-md active:cursor-grabbing dark:border-slate-700/80 dark:bg-slate-800 dark:hover:border-primary-500"
                    >
                      <h4 className="font-medium text-sm text-gray-900 dark:text-gray-100 mb-1">
                        {opp.lead?.title || `Deal #${opp.id.slice(0, 6)}`}
                      </h4>
                      <div className="flex justify-between items-center text-xs text-gray-500 dark:text-gray-400 mt-2">
                        <span className="font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                          {opp.expectedRevenue ? (
                            `$${Number(opp.expectedRevenue).toLocaleString()}`
                          ) : (
                            // Same truthiness as the old 'N/A'; cluster-standard muted dash.
                            <span aria-hidden="true" className="font-normal text-gray-400 dark:text-gray-500">
                              —
                            </span>
                          )}
                        </span>
                        <span>{new Date(opp.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                  ))}
                  {stageDeals.length === 0 && (
                    <div className="h-24 border-2 border-dashed border-gray-300 dark:border-slate-600 rounded-lg flex items-center justify-center text-xs text-gray-400 dark:text-gray-500">
                      Drop deal here
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
