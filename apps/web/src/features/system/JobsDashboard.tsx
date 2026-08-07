import { useState } from 'react';
import { ArrowPathIcon } from '@heroicons/react/24/outline';
import { Play } from 'lucide-react';
import { useQueueStatus, useRetryJobs, useFailedJobs } from './hooks/useJobs';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader } from '../../components/ui/Card';

/*
 * UI PASS (#UI-jobs-dashboard, 2026-08-06): visual-only restyle — the system
 * cluster's Tremor chrome (Grid/Card/Title/Text/Badge/Button/Table) swapped
 * for the shared design-system primitives and the CRM-cluster table language.
 * THIS file only; no hooks, states colors logic, or query behaviour touched.
 *
 * Behaviour preserved exactly (locks: SystemSearchQueryErrorStates +
 * TaskCreateErrorFeedback 'JobsDashboard retry error feedback'):
 *  - Both queries (incl. the 5s refetchInterval), dual-shape error readers,
 *    selectedQueue flow, retry mutation + dismissible banner, and every
 *    rendered string: header copy, 'Loading queues...', both honest failure
 *    panels + fallbacks + Retry, 'View Failed' / 'Retry Failed' / 'Close',
 *    table headers, and 'No failed jobs found.' (renders only on a
 *    SUCCESSFUL empty read — Bug #37).
 *  - Pill semantics unchanged: hue from `failed > 0` (rose) vs emerald,
 *    label from `active > 0` (Active/Idle) — exactly the old Tremor logic.
 *
 * Disclosed additions/changes (visual-only, no lock impact):
 *  - Failed-jobs table gains an honest 'Loading failed jobs...' row while
 *    the query is in flight; previously it flashed 'No failed jobs found.'
 *    during the fetch — the same mild fabrication family as Bug #37.
 *  - Grid is sm:2-cols / lg:3-cols (was 1-col until lg); tablet-friendly.
 *  - Job id truncates with a title tooltip (BullMQ repeat ids get long).
 */

/* Queue health pill — identical hue/label rules to the old Tremor Badge. */
const statusPillClass = (hasFailed: boolean) =>
  `inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${
    hasFailed
      ? 'bg-rose-50 text-rose-700 ring-rose-600/20 dark:bg-rose-400/10 dark:text-rose-300 dark:ring-rose-400/20'
      : 'bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-400/10 dark:text-emerald-300 dark:ring-emerald-400/20'
  }`;

const statLabelClass = 'text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400';
const statValueClass = 'mt-1 text-xl font-semibold tabular-nums text-gray-900 dark:text-gray-100';

export const JobsDashboard = () => {
  /*
   * BUG FIX (system-monitoring lies — failed reads painted "nothing"/
   * fabrications — Bug #37): both job queries surfaced only `isLoading`,
   * so on a rejected read the queues GRID RENDERED BLANK (nothing at all —
   * a monitoring screen with zero signal) and the failed-jobs table claimed
   * "No failed jobs found." even while BullMQ was full of them. Both now
   * expose `isError`/`error`/`refetch` and render honest failure surfaces
   * (message + Retry) before any empty/content branch. Same truth pattern
   * as Bug #31–#36.
   */
  const {
    data: queues,
    isLoading,
    isError: queuesIsError,
    error: queuesError,
    refetch: refetchQueues,
  } = useQueueStatus();
  const retryMutation = useRetryJobs();

  const [selectedQueue, setSelectedQueue] = useState<string | null>(null);
  const [retryError, setRetryError] = useState<string | null>(null); // BUG #28: retry failures were silent
  const {
    data: failedJobs,
    isLoading: failedJobsLoading,
    isError: failedJobsIsError,
    error: failedJobsError,
    refetch: refetchFailedJobs,
  } = useFailedJobs(selectedQueue || '');

  // The jobs controller replies with `{ message }` for its own 404s and the
  // shared envelope `{ error: { message } }` elsewhere (see Bug #28) — so
  // these readers accept both shapes (string-only).
  const readBothShapes = (error: any): string | null => {
    const envelope = error?.response?.data?.error?.message;
    const plain = error?.response?.data?.message;
    return typeof envelope === 'string' && envelope.length > 0
      ? envelope
      : typeof plain === 'string' && plain.length > 0
        ? plain
        : null;
  };
  const queuesErrorMessage = readBothShapes(queuesError);
  const failedJobsErrorMessage = readBothShapes(failedJobsError);

  const handleRetry = (queueName: string) => {
    // BUG FIX (silent retry failures): POST /jobs/retry used to ignore its
    // rejection entirely — a SUPER_ADMIN clicking Retry saw nothing when the
    // queue was missing (404) or Redis was down. Failures now surface in a
    // dismissible banner with the server's message when available.
    setRetryError(null);
    retryMutation.mutate(queueName, {
      onError: (error: any) => {
        // Note: this controller replies with `{ message }` for its own 404s
        // and the shared envelope `{ error: { message } }` for everything
        // else, so read both shapes (string-only).
        const envelopeMessage = error?.response?.data?.error?.message;
        const plainMessage = error?.response?.data?.message;
        const apiMessage =
          typeof envelopeMessage === 'string' && envelopeMessage.length > 0
            ? envelopeMessage
            : typeof plainMessage === 'string' && plainMessage.length > 0
              ? plainMessage
              : null;
        setRetryError(apiMessage ?? 'Failed to retry failed jobs. Please try again.');
      },
    });
  };

  return (
    <div className="p-6 h-full overflow-auto bg-gray-50 dark:bg-slate-900">
      {/* Page header — cluster language; no actions on this screen */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Background Jobs Monitoring</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Monitor BullMQ queues and worker health.</p>
      </div>

      {retryError && (
        <div
          role="alert"
          className="mb-4 flex items-start justify-between gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-300"
        >
          <span>{retryError}</span>
          <button
            type="button"
            aria-label="Dismiss retry failure"
            onClick={() => setRetryError(null)}
            className="font-semibold text-red-500 hover:text-red-700 dark:hover:text-red-200"
          >
            &times;
          </button>
        </div>
      )}

      <div className="mb-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {isLoading ? (
          <div role="status" className="col-span-full flex items-center gap-2 p-2 text-sm text-gray-500 dark:text-gray-400">
            <ArrowPathIcon className="h-4 w-4 animate-spin" aria-hidden="true" />
            Loading queues...
          </div>
        ) : queuesIsError ? (
          // Bug #37: was a totally blank grid — now an honest failure surface.
          <div
            role="alert"
            className="col-span-full mx-auto w-full max-w-xl rounded-lg border border-red-200 bg-red-50 px-6 py-10 text-center dark:border-red-900/50 dark:bg-red-900/20"
          >
            <p className="text-sm font-medium text-red-700 dark:text-red-300">We couldn't load the job queues</p>
            <p className="mt-1 text-sm text-red-600 dark:text-red-400">
              {queuesErrorMessage ?? 'Something went wrong while fetching the queue status. Please try again.'}
            </p>
            <Button size="sm" className="mt-4" onClick={() => refetchQueues()}>
              Retry
            </Button>
          </div>
        ) : (
          queues?.map(queue => (
            <Card key={queue.name} className="relative overflow-hidden p-5">
              {/* Top health accent — same rule as Tremor decoration="top":
                  rose when the queue has failures, primary otherwise. */}
              <span
                aria-hidden="true"
                className={`absolute inset-x-0 top-0 h-1 ${queue.counts.failed > 0 ? 'bg-rose-500' : 'bg-primary-500'}`}
              />
              <div className="flex justify-between items-start gap-3 mb-4">
                <h2 className="text-base font-semibold text-gray-900 dark:text-white break-all">{queue.name}</h2>
                <span className={statusPillClass(queue.counts.failed > 0)}>
                  {queue.counts.active > 0 ? 'Active' : 'Idle'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <p className={statLabelClass}>Waiting</p>
                  <p className={statValueClass}>{queue.counts.waiting}</p>
                </div>
                <div>
                  <p className={statLabelClass}>Active</p>
                  <p className={`${statValueClass} text-primary-600 dark:text-primary-400`}>{queue.counts.active}</p>
                </div>
                <div>
                  <p className={statLabelClass}>Completed</p>
                  <p className={`${statValueClass} text-emerald-600 dark:text-emerald-400`}>{queue.counts.completed}</p>
                </div>
                <div>
                  <p className={statLabelClass}>Failed</p>
                  <p className={`${statValueClass} text-rose-600 dark:text-rose-400`}>{queue.counts.failed}</p>
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setSelectedQueue(queue.name)}
                >
                  View Failed
                </Button>
                {queue.counts.failed > 0 && (
                  <Button
                    size="sm"
                    variant="danger"
                    className="gap-1.5"
                    isLoading={retryMutation.isPending}
                    onClick={() => handleRetry(queue.name)}
                  >
                    {!retryMutation.isPending && <Play className="h-3.5 w-3.5" aria-hidden="true" />}
                    Retry Failed
                  </Button>
                )}
              </div>
            </Card>
          ))
        )}
      </div>

      {selectedQueue && (
        <Card className="overflow-hidden">
          <CardHeader className="flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold leading-6 text-gray-900 dark:text-white">
              Failed Jobs: {selectedQueue}
            </h2>
            <Button size="sm" variant="ghost" onClick={() => setSelectedQueue(null)}>Close</Button>
          </CardHeader>

          {/* Table surface — horizontal scroll contained INSIDE the card */}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50/75 dark:border-slate-700 dark:bg-slate-800/80">
                  <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">ID</th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Name</th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Failed Reason</th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-700/70">
                {failedJobsLoading && !failedJobsIsError ? (
                  // Honest in-flight row — the old code flashed
                  // 'No failed jobs found.' during the fetch (Bug #37 family).
                  <tr>
                    <td colSpan={4} className="px-4 py-8">
                      <div role="status" className="flex items-center justify-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                        <ArrowPathIcon className="h-4 w-4 animate-spin" aria-hidden="true" />
                        Loading failed jobs...
                      </div>
                    </td>
                  </tr>
                ) : null}
                {failedJobsIsError && (
                  // Bug #37: honest failure row — was "No failed jobs found."
                  <tr>
                    <td colSpan={4} className="px-4 py-6">
                      <div
                        role="alert"
                        className="mx-auto max-w-md rounded-lg border border-red-200 bg-red-50 px-4 py-5 text-center dark:border-red-900/50 dark:bg-red-900/20"
                      >
                        <p className="text-sm font-medium text-red-700 dark:text-red-300">We couldn't load the failed jobs</p>
                        <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                          {failedJobsErrorMessage ?? 'Something went wrong while fetching the failed jobs. Please try again.'}
                        </p>
                        <Button size="sm" className="mt-3" onClick={() => refetchFailedJobs()}>
                          Retry
                        </Button>
                      </div>
                    </td>
                  </tr>
                )}
                {failedJobs?.map((job) => (
                  <tr key={job.id} className="hover:bg-gray-50 dark:hover:bg-slate-700/40">
                    <td className="px-4 py-3">
                      <span className="block max-w-[10rem] truncate font-mono text-xs text-gray-600 dark:text-gray-300" title={job.id}>
                        {job.id}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-900 dark:text-gray-100">{job.name}</td>
                    <td className="px-4 py-3">
                      <span className="block max-w-md truncate text-rose-600 dark:text-rose-400" title={job.failedReason}>
                        {job.failedReason}
                      </span>
                    </td>
                    <td className="px-4 py-3 tabular-nums whitespace-nowrap text-gray-500 dark:text-gray-400">
                      {new Date(job.timestamp).toLocaleString()}
                    </td>
                  </tr>
                ))}
                {/* Bug #37: only a SUCCESSFUL empty read may claim no failed jobs. */}
                {!failedJobsIsError && !failedJobsLoading && (!failedJobs || failedJobs.length === 0) && (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-gray-500 dark:text-gray-400">
                      No failed jobs found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
};
