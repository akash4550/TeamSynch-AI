import { DonutChart } from '@tremor/react';
import { ArrowPathIcon } from '@heroicons/react/24/outline';
import { Card } from '../ui/Card';

/*
 * UI PASS (#UI-analytics-shared, 2026-08-07): card chrome de-Tremor'd
 * (ui/Card + shared heading/empty states); the DonutChart itself STAYS
 * Tremor — no charting alternative, and its tokens compile since Round
 * 1's @source foundation. Props API and both state strings
 * ('Loading distribution...' / 'No data available.') are unchanged;
 * loading gains role="status"; dark empty-state surface moved onto slate
 * tokens.
 */

interface DistributionChartProps {
  title: string;
  data: any[];
  category: string;
  index: string;
  colors?: string[];
  valueFormatter?: (value: number) => string;
  isLoading?: boolean;
}

export const DistributionChart = ({
  title,
  data,
  category,
  index,
  colors = ['slate', 'violet', 'indigo', 'rose', 'cyan', 'amber'],
  valueFormatter,
  isLoading
}: DistributionChartProps) => {
  return (
    <Card className="p-5 sm:p-6">
      <h3 className="text-base font-semibold leading-6 text-gray-900 dark:text-white">{title}</h3>
      {isLoading ? (
        <div className="mt-4 flex h-40 items-center justify-center rounded-lg bg-gray-50 dark:bg-slate-800/60">
          <div role="status" className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <ArrowPathIcon className="h-4 w-4 animate-spin" aria-hidden="true" />
            Loading distribution...
          </div>
        </div>
      ) : data.length === 0 ? (
        <div className="mt-4 flex h-40 items-center justify-center rounded-lg bg-gray-50 text-sm text-gray-500 dark:bg-slate-800/60 dark:text-gray-400">
          No data available.
        </div>
      ) : (
        <DonutChart
          className="h-40 mt-4"
          data={data}
          category={category}
          index={index}
          valueFormatter={valueFormatter}
          colors={colors}
        />
      )}
    </Card>
  );
};
