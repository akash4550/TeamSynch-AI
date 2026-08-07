import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { ChevronLeft, ChevronRight, CheckSquare, FolderKanban } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { CalendarConnections } from './CalendarConnections';

/*
 * UI PASS (#UI-calendar, 2026-08-07): nit-pass alignment with the design
 * system (the page already used ui/Card + ui/Button + dark tokens):
 * h1 normalized to the standard semibold ramp, prev/next icon buttons gain
 * accessible names + focus rings, the loading state gains status semantics
 * (copy "Loading calendar events..." verbatim), and the pre-primary-era
 * blue-* accents (today ring/badge, task chips) move to primary-*. The
 * task-vs-project 2-hue coding (primary vs purple chips) is deliberately
 * preserved — same rule as the status hue maps in R5/R23. No behavioral
 * change: query keys, local-date-key grouping (timezone fix), navigation,
 * and every string pinned by CalendarSearchOverlayFailures.test.tsx
 * ("We couldn't load your calendar", singular role="alert", exact 'Retry',
 * SUN-SAT headers) are verbatim.
 */
export const CalendarPage = () => {
  const [currentDate, setCurrentDate] = useState(new Date());

  /*
   * BUG FIX (deadline lie — failed feed rendered an empty month — Bug #40):
   * this query surfaced only `isLoading`, so a rejected GET /calendar (500,
   * network down, expired 401) painted a COMPLETELY EMPTY month grid —
   * telling the user they had no deadlines this month when the feed had
   * simply failed; a scheduling surface that lies can cost a real deadline.
   * `isError`/`error`/`refetch` are now exposed and the card renders an
   * honest failure panel (server message + Retry) before the grid.
   * Same truth pattern as Bug #31–#37.
   */
  const {
    data: feedData,
    isLoading,
    isError,
    error: calendarError,
    refetch,
  } = useQuery({
    queryKey: ['calendar', 'feed'],
    queryFn: async () => {
      const res = await api.get('/calendar');
      return res.data.data;
    },
  });

  const calendarErrorMessage = (() => {
    const m = (calendarError as any)?.response?.data?.error?.message;
    return typeof m === 'string' && m.length > 0 ? m : null;
  })();

  const tasks = feedData?.tasks || [];
  const projects = feedData?.projects || [];

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const firstDayOfMonth = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const prevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  /*
   * BUG FIX (timezone): the previous implementation keyed day cells by
   * `new Date(year, month, dayNum).toISOString()` — a LOCAL midnight instant
   * shifted into UTC — while keying items by their UTC instant. For users east
   * of UTC every item rendered one day late; "a task due right now" also never
   * landed on the ringed "today" cell (which is computed from local getters).
   * Fix: derive BOTH keys from local calendar components, the same frame the
   * grid headers / today-ring / month navigation already use.
   */
  const toLocalDateKey = (date: Date): string => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  // Group task/project deadlines by day number of the current displayed month
  const getItemsForDay = (dayNum: number) => {
    const targetDateStr = toLocalDateKey(new Date(year, month, dayNum));

    const dayTasks = tasks.filter((t: any) => {
      if (!t.dueDate) return false;
      return toLocalDateKey(new Date(t.dueDate)) === targetDateStr;
    });

    const dayProjects = projects.filter((p: any) => {
      if (!p.endDate) return false;
      return toLocalDateKey(new Date(p.endDate)) === targetDateStr;
    });

    return { dayTasks, dayProjects };
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Workspace Calendar</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Track project milestones, task deadlines, and team events.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg p-1 shadow-sm">
            <button
              onClick={prevMonth}
              aria-label="Previous month"
              className="rounded-md p-2 text-gray-600 transition-colors hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500/40 dark:text-gray-300 dark:hover:bg-slate-700"
            >
              <ChevronLeft className="h-5 w-5" aria-hidden="true" />
            </button>
            <span className="min-w-[140px] px-4 text-center text-sm font-semibold text-gray-900 dark:text-white">
              {monthNames[month]} {year}
            </span>
            <button
              onClick={nextMonth}
              aria-label="Next month"
              className="rounded-md p-2 text-gray-600 transition-colors hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500/40 dark:text-gray-300 dark:hover:bg-slate-700"
            >
              <ChevronRight className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      {/* FEATURE (ledger #3): real OAuth connection surface + redirect
          outcome banners; self-contained (reads its own query params and
          endpoints), so the calendar grid below is untouched. */}
      <CalendarConnections />

      <Card className="p-6">
        {isLoading ? (
          <div role="status" className="flex items-center justify-center gap-2 py-12 text-sm text-gray-500 dark:text-gray-400">
            <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            Loading calendar events...
          </div>
        ) : isError ? (
          // Bug #40: honest failure panel — never render an empty month as if
          // there were no deadlines when the feed simply failed.
          <div
            role="alert"
            className="flex flex-col items-center rounded-lg border border-red-200 bg-red-50/60 px-6 py-12 text-center dark:border-red-900/50 dark:bg-red-900/10"
          >
            <h3 className="mb-1 text-lg font-medium text-gray-900 dark:text-white">We couldn't load your calendar</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {calendarErrorMessage ?? 'Something went wrong while fetching your deadlines. Your data is safe — please try again.'}
            </p>
            <Button variant="primary" className="mt-4" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        ) : (
          <div>
            {/* Day Header */}
            <div className="grid grid-cols-7 gap-px bg-gray-200 dark:bg-slate-700 rounded-t-lg overflow-hidden text-center text-xs font-semibold text-gray-700 dark:text-gray-300 py-3">
              <div>SUN</div>
              <div>MON</div>
              <div>TUE</div>
              <div>WED</div>
              <div>THU</div>
              <div>FRI</div>
              <div>SAT</div>
            </div>

            {/* Calendar Grid */}
            <div className="grid grid-cols-7 gap-px bg-gray-200 dark:bg-slate-700 border-b border-x border-gray-200 dark:border-slate-700 rounded-b-lg overflow-hidden">
              {/* Blank leading slots */}
              {Array.from({ length: firstDayOfMonth }).map((_, idx) => (
                <div key={`empty-${idx}`} className="bg-gray-50 dark:bg-slate-900 min-h-[100px] p-2" />
              ))}

              {/* Day slots */}
              {Array.from({ length: daysInMonth }).map((_, idx) => {
                const dayNum = idx + 1;
                const { dayTasks, dayProjects } = getItemsForDay(dayNum);
                const isToday =
                  dayNum === new Date().getDate() &&
                  month === new Date().getMonth() &&
                  year === new Date().getFullYear();

                return (
                  <div
                    key={`day-${dayNum}`}
                    className={`bg-white dark:bg-slate-800 min-h-[110px] p-2 flex flex-col justify-start hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors ${
                      isToday ? 'ring-2 ring-primary-500 ring-inset' : ''
                    }`}
                  >
                    <span
                      className={`mb-1 self-start rounded px-1.5 py-0.5 text-xs font-bold ${
                        isToday ? 'bg-primary-600 text-white' : 'text-gray-700 dark:text-gray-300'
                      }`}
                    >
                      {dayNum}
                    </span>

                    <div className="space-y-1 overflow-y-auto max-h-[80px] text-[11px]">
                      {dayProjects.map((p: any) => (
                        <div
                          key={p.id}
                          className="bg-purple-100 dark:bg-purple-900/40 text-purple-800 dark:text-purple-300 p-1 rounded flex items-center gap-1 truncate"
                          title={`Project Deadline: ${p.name}`}
                        >
                          <FolderKanban className="h-3 w-3 shrink-0" aria-hidden="true" />
                          <span className="truncate">{p.name}</span>
                        </div>
                      ))}

                      {dayTasks.map((t: any) => (
                        <div
                          key={t.id}
                          className="flex items-center gap-1 truncate rounded bg-primary-100 p-1 text-primary-800 dark:bg-primary-900/40 dark:text-primary-300"
                          title={`Task Due: ${t.title}`}
                        >
                          <CheckSquare className="h-3 w-3 shrink-0" aria-hidden="true" />
                          <span className="truncate">{t.title}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
};
