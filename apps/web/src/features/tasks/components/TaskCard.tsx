import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { User } from 'lucide-react';

interface TaskCardProps {
  task: any;
}

export const TaskCard = ({ task }: TaskCardProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id, data: { type: 'Task', task } });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  // Same priority map as before, now legible in BOTH themes (presentation only)
  const priorityColors: Record<string, string> = {
    LOW: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
    MEDIUM: 'bg-yellow-100 text-yellow-800 dark:bg-amber-900/40 dark:text-amber-300',
    HIGH: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300',
    CRITICAL: 'bg-red-100 text-red-800 dark:bg-rose-900/40 dark:text-rose-300',
  };

  return (
    // dnd-kit bindings (ref / style / attributes / listeners) are EXACTLY as before
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="cursor-grab rounded-lg border border-gray-200/80 bg-white p-4 shadow-sm transition-shadow hover:border-primary-400 hover:shadow-md active:cursor-grabbing dark:border-slate-700/80 dark:bg-slate-800 dark:hover:border-primary-500"
    >
      <div className="flex justify-between items-start mb-2">
        <span className="text-xs text-gray-500 font-mono dark:text-gray-400">{task.project?.key}-{task.id.slice(0, 4)}</span>
        <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${priorityColors[task.priority]}`}>
          {task.priority}
        </span>
      </div>
      <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-3 line-clamp-2">
        {task.title}
      </h4>
      <div className="flex justify-between items-center mt-auto">
        <div className="flex -space-x-1">
          {task.assignee ? (
            <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold ring-2 ring-white dark:bg-blue-900/40 dark:text-blue-300 dark:ring-slate-800">
              {task.assignee.firstName[0]}
            </div>
          ) : (
            // UI PASS (#UI-tasks, 2026-08-06): unassigned reads as an empty
            // person silhouette instead of a literal "?" — "?" looked like
            // corrupted data; the dashed-circle + icon says "no assignee".
            <div
              className="flex h-6 w-6 items-center justify-center rounded-full border border-dashed border-gray-300 text-gray-400 dark:border-slate-600 dark:text-gray-500"
              role="img"
              aria-label="Unassigned"
            >
              <User className="h-3 w-3" aria-hidden="true" />
            </div>
          )}
        </div>
        {task._count?.subtasks > 0 && (
          <span className="text-xs text-gray-500 flex items-center gap-1">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
            {task._count.subtasks}
          </span>
        )}
      </div>
    </div>
  );
};
