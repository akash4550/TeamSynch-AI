import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { TaskCard } from './TaskCard';

interface KanbanColumnProps {
  status: string;
  tasks: any[];
}

export const KanbanColumn = ({ status, tasks }: KanbanColumnProps) => {
  // --- Existing droppable wiring: untouched ---
  const { setNodeRef } = useDroppable({
    id: status,
    data: { type: 'Column', status }
  });

  /*
   * Visual-only column config: same labels as before, but every status now owns
   * its FULL light + dark border classes. Important: the base wrapper no longer
   * declares a competing `dark:border-slate-700`, because duplicate border-color
   * classes on one element resolve unpredictably in CSS source order.
   */
  const statusConfig: Record<string, { label: string; color: string; dot: string }> = {
    BACKLOG: { label: 'Backlog', color: 'bg-gray-100/80 border-gray-200 dark:bg-slate-800/60 dark:border-slate-700', dot: 'bg-gray-400' },
    TODO: { label: 'To Do', color: 'bg-blue-50/80 border-blue-200 dark:bg-blue-900/20 dark:border-blue-900/60', dot: 'bg-blue-500' },
    IN_PROGRESS: { label: 'In Progress', color: 'bg-yellow-50/80 border-yellow-200 dark:bg-yellow-900/20 dark:border-yellow-900/60', dot: 'bg-amber-500' },
    IN_REVIEW: { label: 'In Review', color: 'bg-orange-50/80 border-orange-200 dark:bg-orange-900/20 dark:border-orange-900/60', dot: 'bg-orange-500' },
    DONE: { label: 'Done', color: 'bg-green-50/80 border-green-200 dark:bg-green-900/20 dark:border-green-900/60', dot: 'bg-emerald-500' },
  };

  const config = statusConfig[status] || statusConfig.TODO;

  return (
    // RESPONSIVE FIX: 18rem columns on phones (next column peeks = scroll affordance),
    // original 20rem from sm up. Rounded to xl for design-system consistency.
    <div className={`flex w-72 shrink-0 flex-col rounded-xl border sm:w-80 ${config.color}`}>
      {/* Column header: status dot + label + count pill */}
      <div className="flex items-center justify-between gap-2 rounded-t-xl border-b border-inherit bg-white/60 p-3 dark:bg-slate-800/50">
        <h3 className="flex min-w-0 items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-700 dark:text-gray-300">
          <span className={`h-2 w-2 shrink-0 rounded-full ${config.dot}`} />
          <span className="truncate">{config.label}</span>
        </h3>
        <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-xs font-semibold tabular-nums text-gray-600 ring-1 ring-gray-200 dark:bg-slate-700 dark:text-gray-300 dark:ring-slate-600">
          {tasks.length}
        </span>
      </div>

      {/* ORIGINAL droppable body — ref, context and ids untouched */}
      <div
        ref={setNodeRef}
        className="flex min-h-[150px] flex-1 flex-col gap-3 overflow-y-auto p-3"
      >
        <SortableContext items={tasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
          {tasks.map(task => (
            <TaskCard key={task.id} task={task} />
          ))}
        </SortableContext>
      </div>
    </div>
  );
};
