import { AreaChart } from '@tremor/react';
import { ArrowPathIcon } from '@heroicons/react/24/outline';
import { Card } from '../ui/Card';

/*
 * UI PASS (#UI-analytics-shared, 2026-08-07): card chrome de-Tremor'd
 * (ui/Card + shared heading/empty states); the AreaChart itself STAYS
 * Tremor — we have no charting alternative, and Round 1's @source
 * foundation now compiles its tokens. Props API and both state strings
 * ('Loading chart data...' / 'No data available for this period.') are
 * unchanged; loading state gains role="status"; dark empty-state surface
 * moved onto slate tokens.
 */

interface TimeSeriesChartProps {
  title: string;
  data: any[];
  index: string;
  categories: string[];
  colors?: string[];
  valueFormatter?: (value: number) => string;
  isLoading?: boolean;
}

export const TimeSeriesChart = ({
  title,
  data,
  index,
  categories,
  colors = ['blue', 'cyan'],
  valueFormatter,
  isLoading
}: TimeSeriesChartProps) => {
  return (
    <Card className="p-5 sm:p-6">
      <h3 className="text-base font-semibold leading-6 text-gray-900 dark:text-white">{title}</h3>
      {isLoading ? (
        <div className="mt-4 flex h-72 items-center justify-center rounded-lg bg-gray-50 dark:bg-slate-800/60">
          <div role="status" className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <ArrowPathIcon className="h-4 w-4 animate-spin" aria-hidden="true" />
            Loading chart data...
          </div>
        </div>
      ) : data.length === 0 ? (
        <div className="mt-4 flex h-72 items-center justify-center rounded-lg bg-gray-50 text-sm text-gray-500 dark:bg-slate-800/60 dark:text-gray-400">
          No data available for this period.
        </div>
      ) : (
        <AreaChart
          className="h-72 mt-4"
          data={data}
          index={index}
          categories={categories}
          colors={colors}
          valueFormatter={valueFormatter}
          showLegend={true}
        />
      )}
    </Card>
  );
};
