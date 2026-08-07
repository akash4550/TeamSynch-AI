import { useState } from 'react';
import { FilterPanel } from '../../components/analytics/FilterPanel';
import { MetricCard } from '../../components/analytics/MetricCard';
import { Button } from '../../components/ui/Button';
import { useReport, MetricFilter } from './hooks/useAnalytics';

/*
 * UI PASS (#UI-analytics-crm-overview, 2026-08-07): visual-only restyle —
 * Tremor Grid/Button swapped for the shared design system. THIS file
 * only; report query and every Bug #41 contract are verbatim.
 *
 * Locks held (AnalyticsReportFailures — Bug #41; FilterPanel is stubbed
 * in that suite): 'We couldn't load this report' + role="alert" + server
 * message + Retry; exactly THREE '—' text nodes on failure; '$0'/'0%'
 * never render; and the Retry-recovery repaint must produce '7',
 * '$42,000', '33%' — the metric expressions below are byte-identical to
 * the originals for exactly that reason.
 */

export const AnalyticsCRMOverview = () => {
  const [filters, setFilters] = useState<MetricFilter>({});

  /*
   * BUG FIX (fabricated all-zero board on failed report — Bug #41): this
   * query surfaced only `isLoading`, and `getMetricValue` defaults to 0 when
   * the payload is missing — so a rejected GET /analytics/reports/CRM_OVERVIEW
   * painted "Leads Created: 0", "Pipeline Value: $0", "Win Rate: 0%" as if
   * the sales funnel had flatlined. `isError`/`error`/`refetch` are now
   * exposed: failing cards show an honest "—" (unknown, not zero) and a
   * `role="alert"` strip carries the server's message + Retry. Same truth
   * pattern as TeamDashboard (Bug #34).
   */
  const {
    data: report,
    isLoading,
    isError: reportIsError,
    error: reportError,
    refetch: refetchReport,
  } = useReport('CRM_OVERVIEW', filters);

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
  }

  /* FEATURE (ledger #4): surface the API's per-metric definition as the
   * card footnote (decided-deals win rate, open-only pipeline). */
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
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">CRM Analytics</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Analyze lead generation, win rates, and overall pipeline value.</p>
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

      {/* Bug #41: "—" = unknown (read failed); never fabricate a 0.
          Metric expressions unchanged — the recovery test repaints
          '7', '$42,000', '33%' through them. */}
      <div className="mb-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <MetricCard
          title="Leads Created"
          metric={reportIsError ? '—' : getMetricValue('Leads Created')}
          isLoading={isLoading}
          color="blue"
        />
        <MetricCard
          title="Pipeline Value"
          metric={isLoading ? '...' : reportIsError ? '—' : `$${getMetricValue('Pipeline Value').toLocaleString()}`}
          isLoading={isLoading}
          color="emerald"
          footnote={reportIsError ? undefined : getMetricDescription('Pipeline Value')}
        />
        <MetricCard
          title="Win Rate"
          metric={isLoading ? '...' : reportIsError ? '—' : `${getMetricValue('Win Rate')}%`}
          isLoading={isLoading}
          color="amber"
          footnote={reportIsError ? undefined : getMetricDescription('Win Rate')}
        />
      </div>
    </div>
  );
};
