import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FilterPanel } from '../../components/analytics/FilterPanel';
import { MetricCard } from '../../components/analytics/MetricCard';
import { Button } from '../../components/ui/Button';
import { useMetric, MetricFilter } from './hooks/useAnalytics';
import { api } from '../../lib/api';

/*
 * UI PASS (#UI-team-dashboard, 2026-08-07): visual-only restyle — Tremor
 * Grid/Button swapped for the shared design system. THIS file only; the
 * metric query, real-teams fetch, filter mapping, and the Bug #34
 * metric-honesty contract are verbatim.
 *
 * Locks held (DashboardQueryErrorStates — Bug #34): 'We couldn't load this
 * metric' + role="alert" + server message; exactly ONE '—' text node on
 * failure; '0' never renders on failure. FilterPanel is stubbed in that
 * suite — its usage here is unchanged anyway.
 */

export const TeamDashboard = () => {
  const [filters, setFilters] = useState<MetricFilter>({});

  /*
   * BUG FIX (fabricated zero metric — Bug #34): the metric query surfaced
   * only `isLoading`, and the card rendered `teamActivity?.value || 0` — so
   * a rejected GET /analytics/metrics/TASKS_COMPLETED (500, network down,
   * expired 401) painted "Team Tasks Completed: 0" as if the team had done
   * no work. The card now shows an honest "—" (unknown, not zero) with a
   * `role="alert"` strip (server message + Retry) above it. Same truth
   * pattern as Bug #31–#33.
   */
  const {
    data: teamActivity,
    isLoading,
    isError: metricIsError,
    error: metricError,
    refetch: refetchMetric,
  } = useMetric('TASKS_COMPLETED', filters);

  const metricErrorMessage = (() => {
    const m = (metricError as any)?.response?.data?.error?.message;
    return typeof m === 'string' && m.length > 0 ? m : null;
  })();

  /*
   * BUG FIX (team filter guaranteed to fail): the FilterPanel was fed two
   * HARDCODED demo teams ('team-1'/'team-2') that don't exist in any org.
   * Selecting either one sent a bogus teamId to /analytics/metrics, where
   * the tenant-scope assertion (assertFilterScope) rejects unknown teams —
   * so a single dropdown change broke the "Team Tasks Completed" card until
   * reset. Fetch the organization's real teams instead (same `/teams`
   * envelope TeamsPage uses; the ['teams'] cache key + body shape are
   * identical), exposing only entries that actually carry id+name.
   */
  const { data: teamsData } = useQuery({
    queryKey: ['teams'],
    queryFn: async () => {
      const res = await api.get('/teams');
      return res.data;
    },
  });

  const teamOptions = (Array.isArray(teamsData?.data?.teams) ? teamsData.data.teams : [])
    .filter((team: any) => team?.id && team?.name)
    .map((team: any) => ({ id: team.id, name: team.name }));

  const handleDateChange = (range: { from?: Date; to?: Date }) => {
    setFilters(prev => ({
      ...prev,
      startDate: range.from?.toISOString(),
      endDate: range.to?.toISOString(),
    }));
  };

  const handleTeamChange = (teamId: string) => {
    setFilters(prev => ({ ...prev, teamId: teamId === 'all' ? undefined : teamId }));
  };

  return (
    <div className="p-6 h-full overflow-auto bg-gray-50 dark:bg-slate-900">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Team Analytics</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Monitor team activity and productivity.</p>
      </div>

      <FilterPanel
        onDateChange={handleDateChange}
        onTeamChange={handleTeamChange}
        teams={teamOptions}
      />

      {metricIsError && (
        // Bug #34: honest failure strip — the old code painted a fabricated 0.
        <div
          role="alert"
          className="mb-4 flex flex-col gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between dark:border-red-900/50 dark:bg-red-900/20"
        >
          <div>
            <p className="text-sm font-medium text-red-700 dark:text-red-300">We couldn't load this metric</p>
            <p className="text-sm text-red-600 dark:text-red-400">
              {metricErrorMessage ?? 'Something went wrong while fetching the metric. Your data is safe — please try again.'}
            </p>
          </div>
          <Button size="sm" variant="secondary" className="shrink-0 self-start" onClick={() => refetchMetric()}>
            Retry
          </Button>
        </div>
      )}

      {/* Bug #34: "—" = unknown (read failed); never fabricate a 0. */}
      <div className="mb-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <MetricCard
          title="Team Tasks Completed"
          metric={metricIsError ? '—' : teamActivity?.value || 0}
          isLoading={isLoading}
          color="blue"
        />
      </div>
    </div>
  );
};
