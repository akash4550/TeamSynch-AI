import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeftIcon, PhoneIcon, EnvelopeIcon, GlobeAltIcon, PlusIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { useClient, useActivities, useCreateActivity } from './hooks/useCRMQueries';

/*
 * UI PASS (#UI-client-detail, 2026-08-06): visual-only redesign of the
 * client detail view — same design language as the CRM list cluster
 * (#UI-clients…#UI-opportunities). Tremor was swapped for the project's
 * own primitives page-locally (see the foundation note in
 * features/crm/ClientsPage.tsx). ALL state vars, hooks, handlers
 * (handleLogActivity, onSuccess/onError, refetches), conditional rows,
 * and every test-locked behavioural contract are preserved verbatim:
 * "We couldn't load this client" + role="alert" + server message + Retry,
 * 404 → legacy "Client not found." branch with a Back to Clients button,
 * "We couldn't load the activity history" block, "No activity logged
 * yet.", the textarea placeholder, and the "Save Activity" button name.
 */

/* Status pill — same ACTIVE/other mapping as the CRM list cluster. */
const StatusPill = ({ status }: { status: string }) => {
  const active = status === 'ACTIVE';
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${
        active
          ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-400/10 dark:text-emerald-300 dark:ring-emerald-400/20'
          : 'bg-gray-100 text-gray-600 ring-gray-500/10 dark:bg-slate-700/50 dark:text-gray-300 dark:ring-slate-500/30'
      }`}
    >
      {status}
    </span>
  );
};

/* Activity-type pill — same blue semantic as the old Tremor Badge. */
const TypePill = ({ type }: { type: string }) => (
  <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-600/20 dark:bg-blue-400/10 dark:text-blue-300 dark:ring-blue-400/20">
    {type}
  </span>
);

const sectionTitleClass = 'text-base font-semibold leading-6 text-gray-900 dark:text-white';
const inputClass =
  'w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 shadow-sm placeholder:text-gray-500 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/40 dark:border-slate-600 dark:bg-slate-700 dark:text-white dark:placeholder:text-gray-400';

export const ClientDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const [activityNote, setActivityNote] = useState('');
  const [formError, setFormError] = useState<string | null>(null); // inline activity-form failure (Bug #27)
  const [activityType, setActivityType] = useState<'NOTE' | 'CALL' | 'EMAIL' | 'MEETING'>('NOTE');

  /*
   * BUG FIX (mislabeled 404 + fabricated "no activity" on failed reads —
   * Bug #36): the client query surfaced only `isLoading`, and the only
   * fallback was `if (!client)` → "Client not found.", so EVERY failure
   * shape (500, network down, expired 401) claimed the client record was
   * DELETED while the server had simply erred (404 correctly reuses that
   * same legacy branch now). The activity query likewise collapsed failure
   * into "No activity logged yet." Both queries now expose
   * `isError`/`error`/`refetch`: the page renders an honest full-width
   * failure panel (server message + Retry + Back to Clients) for non-404
   * errors, and the Activity History card gets its own failure block.
   * Same truth pattern as Bug #31–#35.
   */
  const {
    data: client,
    isLoading,
    isError: clientIsError,
    error: clientError,
    refetch: refetchClient,
  } = useClient(id || '');
  const {
    data: activities,
    isLoading: isLoadingActivities,
    isError: activitiesIsError,
    error: activitiesError,
    refetch: refetchActivities,
  } = useActivities({ clientId: id });

  const clientErrorMessage = (() => {
    const m = (clientError as any)?.response?.data?.error?.message;
    return typeof m === 'string' && m.length > 0 ? m : null;
  })();
  const activitiesErrorMessage = (() => {
    const m = (activitiesError as any)?.response?.data?.error?.message;
    return typeof m === 'string' && m.length > 0 ? m : null;
  })();
  const createActivityMutation = useCreateActivity();

  const handleLogActivity = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activityNote.trim() || !id) return;

    // BUG FIX (silent create failures — CRM class): logging an activity
    // used to fail with zero feedback on the client detail page; now
    // surfaced inline from the shared `{ error: { message } }` envelope.
    setFormError(null);
    createActivityMutation.mutate(
      {
        clientId: id,
        type: activityType,
        content: activityNote,
      },
      {
        onSuccess: () => {
          setActivityNote('');
          setFormError(null);
        },
        onError: (error: any) => {
          const apiMessage = error?.response?.data?.error?.message;
          setFormError(
            typeof apiMessage === 'string' && apiMessage.length > 0
              ? apiMessage
              : 'Failed to log the activity. Please try again.'
          );
        },
      }
    );
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center p-6" role="status">
        <ArrowPathIcon className="mr-2 h-4 w-4 animate-spin text-gray-400" aria-hidden="true" />
        <span className="text-sm text-gray-500 dark:text-gray-400">Loading client details...</span>
      </div>
    );
  }

  if (clientIsError) {
    // Bug #36: real 404s keep the legacy not-found UI; ANY other failure
    // (500 / network / auth) must NOT claim the client was deleted.
    if ((clientError as any)?.response?.status === 404) {
      return (
        <div className="p-6">
          <p className="text-sm text-gray-600 dark:text-gray-400">Client not found.</p>
          <Link to="/crm/clients"><Button size="sm" className="mt-4">Back to Clients</Button></Link>
        </div>
      );
    }
    return (
      <div
        role="alert"
        className="m-6 max-w-xl rounded-lg border border-red-200 bg-red-50 px-6 py-10 text-center dark:border-red-900/50 dark:bg-red-900/20"
      >
        <p className="text-sm font-medium text-red-700 dark:text-red-300">We couldn't load this client</p>
        <p className="mt-1 text-sm text-red-600 dark:text-red-400">
          {clientErrorMessage ?? 'Something went wrong while fetching this client. Your data is safe — please try again.'}
        </p>
        <div className="mt-4 flex items-center justify-center gap-3">
          <Link to="/crm/clients">
            <Button size="sm" variant="outline">Back to Clients</Button>
          </Link>
          <Button size="sm" onClick={() => refetchClient()}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  if (!client) {
    // Defensive guard (success with an empty payload) — unchanged behavior.
    return (
      <div className="p-6">
        <p className="text-sm text-gray-600 dark:text-gray-400">Client not found.</p>
        <Link to="/crm/clients"><Button size="sm" className="mt-4">Back to Clients</Button></Link>
      </div>
    );
  }

  return (
    <div className="p-6 h-full overflow-auto bg-gray-50 dark:bg-gray-900 space-y-6">
      <Link
        to="/crm/clients"
        className="inline-flex items-center gap-1 text-sm text-gray-500 transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
      >
        <ArrowLeftIcon className="w-4 h-4" aria-hidden="true" /> Back to Clients
      </Link>

      {/* Page header — real type ramp + status pill */}
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">{client.name}</h1>
        <StatusPill status={client.status} />
      </div>
      <p className="-mt-4 text-sm text-gray-500 dark:text-gray-400">
        {client.industry || 'No industry specified'}
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Contact info card */}
        <Card className="lg:col-span-1 h-fit p-5 sm:p-6">
          <h2 className={sectionTitleClass}>Client Information</h2>
          <div className="mt-4 space-y-3 text-sm text-gray-600 dark:text-gray-300">
            {client.email && (
              <div className="flex items-center gap-2">
                <EnvelopeIcon className="w-4 h-4 shrink-0 text-gray-400 dark:text-gray-500" aria-hidden="true" />
                <span>{client.email}</span>
              </div>
            )}
            {client.phone && (
              <div className="flex items-center gap-2">
                <PhoneIcon className="w-4 h-4 shrink-0 text-gray-400 dark:text-gray-500" aria-hidden="true" />
                <span>{client.phone}</span>
              </div>
            )}
            {client.website && (
              <div className="flex items-center gap-2">
                <GlobeAltIcon className="w-4 h-4 shrink-0 text-gray-400 dark:text-gray-500" aria-hidden="true" />
                <a
                  href={client.website}
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-600 hover:underline dark:text-blue-400"
                >
                  {client.website}
                </a>
              </div>
            )}
            {client.address && (
              <div className="pt-2 border-t border-gray-100 dark:border-slate-700">
                <p className="text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">Address</p>
                <p className="mt-1">{client.address}</p>
              </div>
            )}
          </div>
        </Card>

        {/* Activity & Notes */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="p-5 sm:p-6">
            <h2 className={`${sectionTitleClass} mb-4`}>Log Activity</h2>
            <form onSubmit={handleLogActivity} className="space-y-3">
              <div className="flex flex-wrap gap-2" role="group" aria-label="Activity type">
                {(['NOTE', 'CALL', 'EMAIL', 'MEETING'] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    aria-pressed={activityType === type}
                    onClick={() => setActivityType(type)}
                    className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 ${
                      activityType === type
                        ? 'bg-primary-600 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-slate-700/60 dark:text-gray-300 dark:hover:bg-slate-700'
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>
              <label htmlFor="activity-note" className="sr-only">
                Activity details
              </label>
              <textarea
                id="activity-note"
                rows={3}
                required
                value={activityNote}
                onChange={(e) => setActivityNote(e.target.value)}
                placeholder="Log activity details or notes..."
                className={inputClass}
              />
              {formError && (
                <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-400">
                  {formError}
                </p>
              )}
              <div className="flex justify-end">
                <Button type="submit" size="sm" isLoading={createActivityMutation.isPending} className="gap-2">
                  <PlusIcon className="h-4 w-4" aria-hidden="true" />
                  Save Activity
                </Button>
              </div>
            </form>
          </Card>

          <Card className="p-5 sm:p-6">
            <h2 className={`${sectionTitleClass} mb-4`}>Activity History</h2>
            {isLoadingActivities ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">Loading activity history...</p>
            ) : activitiesIsError ? (
              // Bug #36: honest failure block — never claim "No activity
              // logged yet." when the read simply failed.
              <div
                role="alert"
                className="flex flex-col items-center gap-2 rounded-md border border-red-200 bg-red-50 p-6 text-center dark:border-red-900/50 dark:bg-red-900/20"
              >
                <p className="text-sm font-medium text-red-700 dark:text-red-300">We couldn't load the activity history</p>
                <p className="text-sm text-red-600 dark:text-red-400">
                  {activitiesErrorMessage ?? 'Something went wrong while fetching the activity history. Your data is safe — please try again.'}
                </p>
                <Button size="sm" className="mt-1" onClick={() => refetchActivities()}>
                  Retry
                </Button>
              </div>
            ) : !activities || activities.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">No activity logged yet.</p>
            ) : (
              <div className="space-y-4">
                {activities.map((act) => (
                  <div key={act.id} className="border-b border-gray-100 pb-3 last:border-b-0 last:pb-0 dark:border-slate-700/70">
                    <div className="mb-1 flex items-center justify-between gap-3">
                      <TypePill type={act.type} />
                      <span className="text-xs tabular-nums text-gray-400 dark:text-gray-500">
                        {new Date(act.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-sm text-gray-800 dark:text-gray-200">{act.description}</p>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
};
