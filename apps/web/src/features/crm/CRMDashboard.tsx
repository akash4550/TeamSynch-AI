import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowPathIcon,
  BriefcaseIcon,
  CurrencyDollarIcon,
  PresentationChartLineIcon,
  UsersIcon,
} from '@heroicons/react/24/outline';
import { useClients, useOpportunities, useActivities, type Opportunity } from './hooks/useCRMQueries';
import { MetricCard } from '../../components/analytics/MetricCard';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';

/*
 * UI PASS (#UI-crm-dashboard, 2026-08-07): visual-only restyle — the last
 * Tremor chrome in the CRM feature (Card/Title/Text/Metric/Grid/Flex/
 * Icon/Button) swapped for the shared system, and the four KPI tiles now
 * render through the Round-14 shared MetricCard (same `isLoading ? '...'
 * : metric` rule; the "—"-on-error mapping moves into the `metric` prop,
 * preserving the EXACT pinned text contracts below).
 *
 * Locks held (DashboardQueryErrorStates, Bug #34): 'We couldn't load your
 * CRM stats' + server message + Retry; exactly THREE '—' text nodes when
 * the opportunities read fails while Total Clients still shows the real
 * count; '$0' and '0%' never render on failure.
 *
 * Preserved copy/behaviour: the five nav links (labels + routes), the
 * truncation-honesty note, activities block copy + Retry + 'No recent
 * activities found.', `slice(0, 5)`, `formatCurrency`, `${conversionRate}%`,
 * and all query params ({limit: 1} / {limit: 500}).
 *
 * Disclosed visual-only changes: nav links are real anchors styled like
 * the outline/primary buttons (was <button> nested in <a> via Tremor);
 * KPI icons are consistent MetricCard chips (was 1 Tremor Icon + 3
 * watermark heroicons); dark surfaces moved onto slate tokens; type tag
 * uses the cluster pill (primary hue — was literal blue-* classes).
 */

/* Mirrors ui/Button (outline, sm) / (primary, sm) for nav links — real
 * anchor semantics instead of nesting a <button> inside <Link>. */
const navLinkClass = (primary?: boolean) =>
  `inline-flex h-8 items-center justify-center rounded-md px-3 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-slate-900 ${
    primary
      ? 'bg-primary-600 text-white hover:bg-primary-700 focus:ring-primary-500'
      : 'border border-gray-300 bg-transparent text-gray-700 hover:bg-gray-50 focus:ring-gray-500 dark:border-slate-600 dark:text-gray-200 dark:hover:bg-slate-700'
  }`;

export const CRMDashboard = () => {
  /*
   * BUG FIX (KPI cards computed from truncated data): the CRM list endpoints
   * default to page=1/limit=10, and the dashboard computed every metric from
   * the returned array length — so "Total Clients" capped out at "10", and
   * Pipeline Value / Avg. Win Probability were silently calculated from only
   * the first 10 deals, no matter how large the real pipeline is. Counts now
   * use the response `total` (always exact), and opportunities are fetched
   * with an explicit larger limit so the revenue/probability aggregates cover
   * the real pipeline (ledger #6 raised both the API cap and this fetch to
   * 500; truncation past it is declared next to the cards). Clients are
   * fetched with `limit: 1` because only the count is needed.
   */
  /*
   * BUG FIX (fabricated zero-metrics — Bug #34): these queries surfaced only
   * `isLoading`, so a rejected GET (500, network down, expired 401) painted
   * AUTHORITATIVE LIES on the sales dashboard: "Total Clients: 0", "Active
   * Deals: 0", "Pipeline Value: $0", "Avg. Win Probability: 0%", and "No
   * recent activities found." — a manager glancing at a wedged backend
   * would believe the pipeline was wiped. Failing metrics now show an
   * honest "—" (unknown, not zero), a `role="alert"` strip with the
   * server's message + Retry covers the cards, and the activity list shows
   * its own failure block + Retry. Same truth pattern as Bug #31–#33.
   */
  const {
    data: clientsData,
    isLoading: isLoadingClients,
    isError: clientsIsError,
    error: clientsError,
    refetch: refetchClients,
  } = useClients({ limit: 1 });
  const {
    data: oppsData,
    isLoading: isLoadingOpps,
    isError: oppsIsError,
    error: oppsError,
    refetch: refetchOpps,
  } = useOpportunities({ limit: 500 });
  const {
    data: activitiesData,
    isLoading: isLoadingActivities,
    isError: activitiesIsError,
    error: activitiesError,
    refetch: refetchActivities,
  } = useActivities();

  // Shared `{ error: { message } }` envelope extraction (string-only).
  const metricsErrorMessage = (() => {
    for (const e of [clientsError, oppsError]) {
      const m = (e as any)?.response?.data?.error?.message;
      if (typeof m === 'string' && m.length > 0) return m;
    }
    return null;
  })();
  const activitiesErrorMessage = (() => {
    const m = (activitiesError as any)?.response?.data?.error?.message;
    return typeof m === 'string' && m.length > 0 ? m : null;
  })();

  const opportunities = oppsData?.data || [];
  const activities = activitiesData || [];

  // Exact counts come from the API's `total`, never from the fetched page length.
  const totalClients = clientsData?.total ?? 0;
  const activeOpportunities = oppsData?.total ?? 0;

  const pipelineValue = useMemo(() => {
    return opportunities.reduce((sum: number, opp: Opportunity) => sum + Number(opp.expectedRevenue || 0), 0);
  }, [opportunities]);

  const conversionRate = useMemo(() => {
    if (opportunities.length === 0) return 0;
    // Calculate average probability across pipeline
    const totalProb = opportunities.reduce((sum: number, opp: Opportunity) => sum + (opp.probability || 0), 0);
    return Math.round(totalProb / opportunities.length);
  }, [opportunities]);

  const recentActivities = useMemo(() => {
    return activities.slice(0, 5);
  }, [activities]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
  };

  return (
    <div className="p-6 h-full overflow-auto bg-gray-50 dark:bg-slate-900">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">CRM Dashboard</h1>
        <p className="mt-1 mb-4 text-sm text-gray-500 dark:text-gray-400">Overview of your sales pipeline and customer relationships.</p>

        {/* Section nav — real links with button styling (no nested <button>) */}
        <nav aria-label="CRM sections" className="flex flex-wrap gap-2">
          <Link to="/crm/clients" className={navLinkClass()}>Clients</Link>
          <Link to="/crm/contacts" className={navLinkClass()}>Contacts</Link>
          <Link to="/crm/leads" className={navLinkClass()}>Leads</Link>
          <Link to="/crm/opportunities" className={navLinkClass()}>Opportunities</Link>
          <Link to="/crm/pipeline" className={navLinkClass(true)}>Pipeline Board</Link>
        </nav>
      </div>

      {/* FEATURE (ledger #6 — aggregate caps + truncation honesty): the
          revenue/avg-probability aggregates are computed from the fetched
          opportunity page (raised 100→500 by the exception list). When the
          org's deals exceed the fetched set, declare the coverage instead
          of presenting a partial picture as the whole truth. */}
      {!oppsIsError && (oppsData?.total ?? 0) > opportunities.length && (
        <p className="mb-4 text-xs text-gray-500 dark:text-gray-400">
          Pipeline aggregates cover the first {opportunities.length} of {oppsData?.total} deals
          — narrow by stage or search on the Opportunities page for the full picture.
        </p>
      )}

      {/* Bug #34: honest failure strip for the metric cards — replaces the
          fabricated zero/$0/0% that a rejected read used to paint. */}
      {(clientsIsError || oppsIsError) && (
        <div
          role="alert"
          className="mb-4 flex flex-col gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between dark:border-red-900/50 dark:bg-red-900/20"
        >
          <div>
            <p className="text-sm font-medium text-red-700 dark:text-red-300">We couldn't load your CRM stats</p>
            <p className="text-sm text-red-600 dark:text-red-400">
              {metricsErrorMessage ?? 'Something went wrong while fetching your stats. Your data is safe — please try again.'}
            </p>
          </div>
          <Button
            size="sm"
            variant="secondary"
            className="shrink-0 self-start"
            onClick={() => {
              if (clientsIsError) refetchClients();
              if (oppsIsError) refetchOpps();
            }}
          >
            Retry
          </Button>
        </div>
      )}

      {/* KPI tiles — the shared MetricCard now owns the '...' loading rule
          and the hue map; "—" on error is passed via `metric` (pinned). */}
      <div className="mb-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Total Clients"
          metric={clientsIsError ? '—' : totalClients}
          isLoading={isLoadingClients}
          color="blue"
          icon={UsersIcon}
        />
        <MetricCard
          title="Active Deals"
          metric={oppsIsError ? '—' : activeOpportunities}
          isLoading={isLoadingOpps}
          color="emerald"
          icon={BriefcaseIcon}
        />
        <MetricCard
          title="Pipeline Value"
          metric={oppsIsError ? '—' : formatCurrency(pipelineValue)}
          isLoading={isLoadingOpps}
          color="amber"
          icon={CurrencyDollarIcon}
        />
        <MetricCard
          title="Avg. Win Probability"
          metric={oppsIsError ? '—' : `${conversionRate}%`}
          isLoading={isLoadingOpps}
          color="indigo"
          icon={PresentationChartLineIcon}
        />
      </div>

      <div className="grid grid-cols-1 gap-6">
        <Card className="p-5 sm:p-6">
          <h2 className="text-base font-semibold leading-6 text-gray-900 dark:text-white">Recent Activities & Notes</h2>
          <div className="mt-4 space-y-4">
            {isLoadingActivities ? (
              <div role="status" className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                <ArrowPathIcon className="h-4 w-4 animate-spin" aria-hidden="true" />
                Loading...
              </div>
            ) : activitiesIsError ? (
              // Bug #34: honest failure block — never claim "No recent
              // activities found." when the read simply failed.
              <div
                role="alert"
                className="flex flex-col items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-6 text-center dark:border-red-900/50 dark:bg-red-900/20"
              >
                <p className="font-medium text-red-700 dark:text-red-300">We couldn't load recent activities</p>
                <p className="text-sm text-red-600 dark:text-red-400">
                  {activitiesErrorMessage ?? 'Something went wrong while fetching activities. Your data is safe — please try again.'}
                </p>
                <Button size="sm" variant="secondary" className="mt-1" onClick={() => refetchActivities()}>
                  Retry
                </Button>
              </div>
            ) : recentActivities.length > 0 ? (
              recentActivities.map(activity => (
                <div key={activity.id} className="flex flex-col border-b border-gray-100 pb-2 last:border-b-0 dark:border-slate-700/70">
                  <div className="mb-1 flex items-center gap-2">
                    <span className="inline-flex items-center rounded-full bg-primary-50 px-2.5 py-0.5 text-xs font-medium text-primary-700 ring-1 ring-inset ring-primary-600/20 dark:bg-primary-400/10 dark:text-primary-300 dark:ring-primary-400/20">
                      {activity.type}
                    </span>
                    <span className="text-xs tabular-nums text-gray-500 dark:text-gray-400">
                      {new Date(activity.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{activity.description}</span>
                </div>
              ))
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400">No recent activities found.</p>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
};
