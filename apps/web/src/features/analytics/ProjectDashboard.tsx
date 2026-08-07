import { useState } from 'react';
import { FilterPanel } from '../../components/analytics/FilterPanel';
import { MetricCard } from '../../components/analytics/MetricCard';
import { DistributionChart } from '../../components/analytics/DistributionChart';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { useReport, MetricFilter } from './hooks/useAnalytics';

/*
 * UI PASS (#UI-project-dashboard, 2026-08-07): visual-only restyle —
 * Tremor Grid/Card/Title/Text/Button swapped for the shared design
 * system. THIS file only; report query, metric extraction, and every
 * Bug #41 contract are verbatim.
 *
 * Locks held (AnalyticsReportFailures — Bug #41, the strictest dashboard
 * gate): 'We couldn't load this report' + role="alert" + server message
 * (+ Retry); exactly FOUR '—' text nodes on failure; '0%' never renders;
 * and the {!reportIsError && ...} GATE keeps BOTH 'No data available.'
 * (DistributionChart empty state) and 'tasks are currently overdue' from
 * painting while the read is failed.
 */

export const ProjectDashboard = () => {
  const [filters, setFilters] = useState<MetricFilter>({});

  /*
   * BUG FIX (fabricated all-zero board on failed report — Bug #41): this
   * query surfaced only `isLoading`, and `getMetricValue` defaults to 0 when
   * the payload is missing — so a rejected GET /analytics/reports/PROJECT_HEALTH
   * painted "Tasks Completed: 0", "Completion Rate: 0%", "0 tasks are
   * currently overdue", plus a distribution chart declaring "No data
   * available." — a project-health board that lies about health.
   * `isError`/`error`/`refetch` are now exposed: failing cards show "—", a
   * `role="alert"` strip carries the server's message + Retry, and the
   * chart/overdue section is hidden outright (its only honest states need
   * report data). Same truth pattern as TeamDashboard (Bug #34).
   */
  const {
    data: report,
    isLoading,
    isError: reportIsError,
    error: reportError,
    refetch: refetchReport,
  } = useReport('PROJECT_HEALTH', filters);

  const reportErrorMessage = (() => {
    const m = (reportError as any)?.response?.data?.error?.message;
    return typeof m === 'string' && m.length > 0 ? m : null;
  })();

  const handleDateChange = (range: { from?: Date; to?: Date }) => {
    setFilters(prev => ({
      ...prev,
      startDate: range.from?.toISOString(),
      endDate: range.to?.toISOString(),
    }));
  };

  const getMetricValue = (name: string) => {
    if (!report || !report.results) return 0;
    const metric = report.results.find((m: any) => m.name === name);
    return metric?.value || 0;
  };

  const getDistributionData = (name: string) => {
    if (!report || !report.results) return [];
    const metric = report.results.find((m: any) => m.name === name);
    return metric?.type === 'distribution' ? metric.value : [];
  };

  /* FEATURE (ledger #4): surface the API's per-metric definition as the
   * card footnote (completion-date window, throughput-vs-intake rate). */
  const getMetricDescription = (name: string): string | undefined => {
    if (!report || !report.results) return undefined;
    const metric = report.results.find((m: any) => m.name === name);
    return typeof metric?.description === 'string' && metric.description.length > 0
      ? metric.description
      : undefined;
  };

  return (
    <div className="p-6 h-full overflow-auto bg-gray-50 dark:bg-slate-900">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Project & Task Dashboard</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Monitor project health, task completion, and team velocity.</p>
      </div>

      <FilterPanel onDateChange={handleDateChange} />

      {/* Bug #41: honest failure strip replaces the fabricated all-zero board. */}
      {reportIsError && (
        <div
          role="alert"
          className="mb-4 flex flex-col gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between dark:border-red-900/50 dark:bg-red-900/20"
        >
          <div>
            <p className="text-sm font-medium text-red-700 dark:text-red-300">We couldn't load this report</p>
            <p className="text-sm text-red-600 dark:text-red-400">
              {reportErrorMessage ?? 'Something went wrong while fetching the report. Your data is safe — please try again.'}
            </p>
          </div>
          <Button size="sm" variant="secondary" className="shrink-0 self-start" onClick={() => refetchReport()}>
            Retry
          </Button>
        </div>
      )}

      <div className="mb-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Active Projects"
          // Bug #41: "—" = unknown (read failed); never fabricate a 0.
          metric={reportIsError ? '—' : getMetricValue('Active Projects')}
          isLoading={isLoading}
          color="blue"
        />
        <MetricCard
          title="Tasks Created"
          metric={reportIsError ? '—' : getMetricValue('Tasks Created')}
          isLoading={isLoading}
          color="amber"
        />
        <MetricCard
          title="Tasks Completed"
          metric={reportIsError ? '—' : getMetricValue('Tasks Completed')}
          isLoading={isLoading}
          color="emerald"
          footnote={reportIsError ? undefined : getMetricDescription('Tasks Completed')}
        />
        <MetricCard
          title="Completion Rate"
          metric={isLoading ? '...' : reportIsError ? '—' : `${getMetricValue('Task Completion Rate')}%`}
          isLoading={isLoading}
          color="indigo"
          footnote={reportIsError ? undefined : getMetricDescription('Task Completion Rate')}
        />
      </div>

      {/* Bug #41: the lower section's only honest states need report data —
          a failed read used to paint "No data available." and "0 tasks are
          currently overdue" as if they were true. Hidden while in failure. */}
      {!reportIsError && (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <DistributionChart
          title="Task Status Distribution"
          data={getDistributionData('Task Statuses')}
          category="value"
          index="category"
          isLoading={isLoading}
        />

        <Card className="p-5 sm:p-6">
          <h2 className="text-base font-semibold leading-6 text-gray-900 dark:text-white">Overdue Tasks Warning</h2>
          <div className="mt-4 flex flex-col items-center justify-center py-6">
            <p className="text-4xl font-semibold tabular-nums text-rose-500">
              {isLoading ? '...' : getMetricValue('Overdue Tasks')}
            </p>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">tasks are currently overdue</p>
          </div>
        </Card>
      </div>
      )}
    </div>
  );
};
