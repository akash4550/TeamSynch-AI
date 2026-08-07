import { DateRangePicker } from '@tremor/react';
import { Card } from '../ui/Card';

/*
 * UI PASS (#UI-analytics-shared, 2026-08-07): FilterPanel partially
 * de-Tremor'd. The DateRangePicker stays Tremor ON PURPOSE — the Bug #67
 * regression suite mocks @tremor/react and captures this exact picker's
 * onValueChange, so the component identity is a pinned contract —
 * but the panel chrome (Card) and the two Selects are now the shared
 * design system (native labelled selects, same onProjectChange /
 * onTeamChange(value) callback signatures, same option values 'all'+id).
 *
 * The Bug #67 end-of-day normalization below is untouched, verbatim.
 */

interface FilterPanelProps {
  onDateChange: (dateRange: { from?: Date; to?: Date }) => void;
  onProjectChange?: (projectId: string) => void;
  onTeamChange?: (teamId: string) => void;
  projects?: { id: string; name: string }[];
  teams?: { id: string; name: string }[];
}

const selectClass =
  'h-10 w-full md:w-64 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/40 dark:border-slate-600 dark:bg-slate-700 dark:text-gray-100';

export const FilterPanel = ({
  onDateChange,
  onProjectChange,
  onTeamChange,
  projects,
  teams,
}: FilterPanelProps) => {
  /*
   * BUG FIX (#67 — the selected END DAY silently dropped out of every
   * analytics range): Tremor's DateRangePicker reports `to` as a Date at
   * LOCAL MIDNIGHT (00:00:00.000) of the chosen end day. Every dashboard
   * serializes it straight to ISO and the API applies it as
   * `createdAt.lte` — so a range ending "Aug 4" covered only up to Aug 4
   * 00:00:00 local, excluding the entire end day (and a same-day selection
   * spanned ZERO seconds — today's data could never appear in "Today"). A
   * date-range picker's contract is inclusive: normalize `to` to the END
   * of the selected day in the user's timezone (23:59:59.999 local, which
   * toISOString() then converts to the equivalent UTC instant). `from`
   * already means "start of the from-day", which is the correct inclusive
   * lower bound and is left untouched. Centralized here so all four
   * dashboard tabs (Executive/CRM/Project/Team) — and any future consumer
   * of this panel — inherit the fix.
   */
  const normalizeToEndOfDay = (date?: Date): Date | undefined => {
    if (!date) return date;
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);
    return endOfDay;
  };

  return (
    <Card className="mb-6 flex flex-col items-stretch gap-4 px-6 py-4 md:flex-row md:items-center md:justify-between">
      <div className="flex w-full flex-col gap-4 sm:flex-row md:w-auto">
        {projects && onProjectChange && (
          <div className="w-full md:w-64">
            <label htmlFor="analytics-filter-project" className="sr-only">
              Filter by Project
            </label>
            <select
              id="analytics-filter-project"
              defaultValue=""
              onChange={(e) => onProjectChange(e.target.value)}
              className={selectClass}
            >
              <option value="" disabled>
                Filter by Project
              </option>
              <option value="all">All Projects</option>
              {projects.map((p: { id: string; name: string }) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {teams && onTeamChange && (
          <div className="w-full md:w-64">
            <label htmlFor="analytics-filter-team" className="sr-only">
              Filter by Team
            </label>
            <select
              id="analytics-filter-team"
              defaultValue=""
              onChange={(e) => onTeamChange(e.target.value)}
              className={selectClass}
            >
              <option value="" disabled>
                Filter by Team
              </option>
              <option value="all">All Teams</option>
              {teams.map((t: { id: string; name: string }) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="w-full md:w-auto">
        {/* Tremor picker kept by contract (Bug #67 test mocks this import);
            it renders foundation-styled since Round 1's @source fix. */}
        <DateRangePicker
          className="max-w-md mx-auto"
          onValueChange={(value: { from?: Date; to?: Date }) =>
            onDateChange({ ...value, to: normalizeToEndOfDay(value.to) })
          }
          enableSelect={false}
        />
      </div>
    </Card>
  );
};
