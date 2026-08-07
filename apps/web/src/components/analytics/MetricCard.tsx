import {
  ArrowTrendingDownIcon,
  ArrowTrendingUpIcon,
  MinusIcon,
} from '@heroicons/react/24/outline';
import { Card } from '../ui/Card';

/*
 * UI PASS (#UI-analytics-shared, 2026-08-07): MetricCard de-Tremor'd —
 * Card/Text/Metric/Flex/Icon/BadgeDelta swapped for the shared design
 * system. PUBLIC PROPS API IS 100% UNCHANGED (title / metric / icon /
 * trend{type,value} / color 5-hue union / isLoading / footnote) and both
 * render rules are verbatim: `isLoading ? '...' : metric`, footnote and
 * trend rows still appear only when NOT loading (ledger #4 honesty
 * footnote untouched).
 *
 * Hue semantics preserved: the `color` prop still drives the top accent
 * bar and the icon chip (blue / emerald / amber / indigo / rose), and the
 * delta pill keeps BadgeDelta's meaning — increase family emerald up,
 * decrease family rose down, unchanged gray minus. Consumed by all four
 * analytics dashboards + (via props contract) any KPI surface.
 */

interface MetricCardProps {
  title: string;
  metric: string | number;
  icon?: any; // HeroIcon
  trend?: {
    value: string;
    type: 'increase' | 'moderateIncrease' | 'unchanged' | 'moderateDecrease' | 'decrease';
  };
  color?: 'blue' | 'emerald' | 'amber' | 'indigo' | 'rose';
  isLoading?: boolean;
  /*
   * FEATURE (ledger #4, 2026-08-05 — metric semantics): optional honesty
   * footnote. The API now ships a plain-language `description` with every
   * redefined KPI (what the number counts and what it excludes);
   * dashboards pass it through so "92%" can never over-promise. Purely
   * additive — cards that don't pass it render exactly as before.
   */
  footnote?: string;
}

const colorStyles: Record<NonNullable<MetricCardProps['color']>, { bar: string; chip: string }> = {
  blue: {
    bar: 'bg-primary-500',
    chip: 'bg-primary-50 text-primary-600 dark:bg-primary-400/10 dark:text-primary-400',
  },
  emerald: {
    bar: 'bg-emerald-500',
    chip: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-400/10 dark:text-emerald-400',
  },
  amber: {
    bar: 'bg-amber-500',
    chip: 'bg-amber-50 text-amber-600 dark:bg-amber-400/10 dark:text-amber-400',
  },
  indigo: {
    bar: 'bg-indigo-500',
    chip: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-400/10 dark:text-indigo-400',
  },
  rose: {
    bar: 'bg-rose-500',
    chip: 'bg-rose-50 text-rose-600 dark:bg-rose-400/10 dark:text-rose-400',
  },
};

/* BadgeDelta's three visual meanings, as shared-system pills. */
const deltaStyles = (type: NonNullable<MetricCardProps['trend']>['type']) => {
  if (type === 'increase' || type === 'moderateIncrease') {
    return {
      Icon: ArrowTrendingUpIcon,
      className:
        'bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-400/10 dark:text-emerald-300 dark:ring-emerald-400/20',
    };
  }
  if (type === 'decrease' || type === 'moderateDecrease') {
    return {
      Icon: ArrowTrendingDownIcon,
      className:
        'bg-rose-50 text-rose-700 ring-rose-600/20 dark:bg-rose-400/10 dark:text-rose-300 dark:ring-rose-400/20',
    };
  }
  return {
    Icon: MinusIcon,
    className:
      'bg-gray-100 text-gray-600 ring-gray-500/10 dark:bg-slate-700/50 dark:text-gray-300 dark:ring-slate-500/30',
  };
};

export const MetricCard = ({
  title,
  metric,
  icon: IconCmp,
  trend,
  color = 'blue',
  isLoading,
  footnote
}: MetricCardProps) => {
  const styles = colorStyles[color];
  return (
    <Card className="relative overflow-hidden p-5">
      {/* Top accent — same decoration rule as the old Tremor Card. */}
      <span aria-hidden="true" className={`absolute inset-x-0 top-0 h-1 ${styles.bar}`} />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-gray-500 dark:text-gray-400">{title}</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-gray-900 dark:text-white">
            {isLoading ? '...' : metric}
          </p>
        </div>
        {IconCmp && (
          <span className={`inline-flex shrink-0 items-center justify-center rounded-lg p-2 ${styles.chip}`}>
            <IconCmp className="h-6 w-6" aria-hidden="true" />
          </span>
        )}
      </div>
      {footnote && !isLoading && (
        <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">{footnote}</p>
      )}
      {trend && !isLoading && (
        <div className="mt-4 flex items-center gap-2">
          {(() => {
            const delta = deltaStyles(trend.type);
            return (
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${delta.className}`}
              >
                <delta.Icon className="h-3.5 w-3.5" aria-hidden="true" />
                {trend.value}
              </span>
            );
          })()}
          <span className="text-xs text-gray-500 dark:text-gray-400">vs last period</span>
        </div>
      )}
    </Card>
  );
};
