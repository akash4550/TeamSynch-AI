import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { ChevronLeft, ChevronRight, CheckSquare, FolderKanban } from 'lucide-react';
import { Card } from '../../components/ui/Card';

export const CalendarPage = () => {
  const [currentDate, setCurrentDate] = useState(new Date());

  const { data: feedData, isLoading } = useQuery({
    queryKey: ['calendar', 'feed'],
    queryFn: async () => {
      const res = await api.get('/calendar');
      return res.data.data;
    },
  });

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

  // Group task/project deadlines by day number of the current displayed month
  const getItemsForDay = (dayNum: number) => {
    const targetDateStr = new Date(year, month, dayNum).toISOString().split('T')[0];

    const dayTasks = tasks.filter((t: any) => {
      if (!t.dueDate) return false;
      return new Date(t.dueDate).toISOString().split('T')[0] === targetDateStr;
    });

    const dayProjects = projects.filter((p: any) => {
      if (!p.endDate) return false;
      return new Date(p.endDate).toISOString().split('T')[0] === targetDateStr;
    });

    return { dayTasks, dayProjects };
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Workspace Calendar</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Track project milestones, task deadlines, and team events.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg p-1 shadow-sm">
            <button
              onClick={prevMonth}
              className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-md text-gray-600 dark:text-gray-300"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <span className="px-4 text-sm font-semibold text-gray-900 dark:text-white min-w-[140px] text-center">
              {monthNames[month]} {year}
            </span>
            <button
              onClick={nextMonth}
              className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-md text-gray-600 dark:text-gray-300"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      <Card className="p-6">
        {isLoading ? (
          <div className="text-center py-12 text-gray-500">Loading calendar events...</div>
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
                      isToday ? 'ring-2 ring-blue-500 ring-inset' : ''
                    }`}
                  >
                    <span
                      className={`text-xs font-bold mb-1 self-start px-1.5 py-0.5 rounded ${
                        isToday ? 'bg-blue-600 text-white' : 'text-gray-700 dark:text-gray-300'
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
                          <FolderKanban className="w-3 h-3 shrink-0" />
                          <span className="truncate">{p.name}</span>
                        </div>
                      ))}

                      {dayTasks.map((t: any) => (
                        <div
                          key={t.id}
                          className="bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300 p-1 rounded flex items-center gap-1 truncate"
                          title={`Task Due: ${t.title}`}
                        >
                          <CheckSquare className="w-3 h-3 shrink-0" />
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
