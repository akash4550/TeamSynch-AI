import { useEffect, useRef, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragOverEvent,
  DragEndEvent,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { KanbanColumn } from './KanbanColumn';
import { TaskCard } from './TaskCard';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../lib/api';

const COLUMNS = ['BACKLOG', 'TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE'];

interface KanbanBoardProps {
  tasks: any[];
}

export const KanbanBoard = ({ tasks: initialTasks }: KanbanBoardProps) => {
  const [tasks, setTasks] = useState(initialTasks);
  const [activeTask, setActiveTask] = useState<any | null>(null);
  const queryClient = useQueryClient();

  /*
   * BUG FIX (phantom state on failed moves): drag-over/drag-end write the
   * board OPTIMISTICALLY via setTasks, but the persist mutation had no
   * onError at all — a rejected PATCH (400/403/network) left the card
   * sitting in its new column forever even though the server never saved
   * it. Other users never received a socket event either (Bug #14's bridge
   * only fires on real persisted moves), so the local board silently
   * diverged from the truth until a manual refetch snapped it back. We now
   * snapshot the board when a drag starts and roll back to that snapshot
   * if the persist fails, with a visible notification so the divergence
   * is honest.
   */
  const dragStartSnapshotRef = useRef<any[] | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);

  useEffect(() => {
    setTasks(initialTasks);
  }, [initialTasks]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const moveTaskMutation = useMutation({
    mutationFn: async ({ taskId, status, position }: { taskId: string, status: string, position: number }) => {
      const res = await api.patch(`/tasks/${taskId}/move`, { status, position });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    }
  });

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const task = tasks.find(t => t.id === active.id);
    if (task) setActiveTask(task);
    // Rollback baseline for this drag: nothing has been optimistically
    // mutated yet, so this snapshot is the last server-truth state.
    dragStartSnapshotRef.current = tasks;
    // A fresh drag settles the previous failure notification.
    setMoveError(null);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;

    const activeId = active.id;
    const overId = over.id;

    if (activeId === overId) return;

    const isActiveTask = active.data.current?.type === 'Task';
    const isOverTask = over.data.current?.type === 'Task';
    const isOverColumn = over.data.current?.type === 'Column';

    if (!isActiveTask) return;

    // Moving over another task
    if (isActiveTask && isOverTask) {
      setTasks((prev) => {
        const activeIndex = prev.findIndex(t => t.id === activeId);
        const overIndex = prev.findIndex(t => t.id === overId);

        if (prev[activeIndex].status !== prev[overIndex].status) {
          const newTasks = [...prev];
          newTasks[activeIndex] = { ...newTasks[activeIndex], status: prev[overIndex].status };
          return newTasks;
        }
        return prev;
      });
    }

    // Moving to an empty column
    if (isActiveTask && isOverColumn) {
      setTasks((prev) => {
        const activeIndex = prev.findIndex(t => t.id === activeId);
        if (prev[activeIndex].status !== overId) {
          const newTasks = [...prev];
          newTasks[activeIndex] = { ...newTasks[activeIndex], status: overId as string };
          return newTasks;
        }
        return prev;
      });
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveTask(null);
    const { active, over } = event;
    if (!over) return;

    const activeId = active.id;
    const overId = over.id;
    const activeTask = tasks.find(t => t.id === activeId);
    if (!activeTask) return;

    const isOverTask = over.data.current?.type === 'Task';
    const isOverColumn = over.data.current?.type === 'Column';
    
    let newStatus = activeTask.status;
    let newPosition = activeTask.position;

    const columnTasks = tasks
      .filter(t => t.status === (isOverColumn ? overId : tasks.find(x => x.id === overId)?.status))
      .sort((a, b) => a.position - b.position);

    if (isOverColumn) {
        newStatus = overId as string;
        if (columnTasks.length === 0) {
            newPosition = 65536;
        } else {
            // Append to end of empty column logically handled by drag over
            newPosition = columnTasks[columnTasks.length - 1].position + 65536;
        }
    } else if (isOverTask) {
        const overIndex = columnTasks.findIndex(t => t.id === overId);
        const overTask = columnTasks[overIndex];
        newStatus = overTask.status;

        if (activeId !== overId) {
            // Calculate fractional position
            const activeOriginalIndex = columnTasks.findIndex(t => t.id === activeId);
            const isMovingDown = activeOriginalIndex !== -1 && activeOriginalIndex < overIndex;

            if (isMovingDown) {
                // Insert after overTask
                const nextTask = columnTasks[overIndex + 1];
                if (nextTask) {
                    newPosition = (overTask.position + nextTask.position) / 2;
                } else {
                    newPosition = overTask.position + 65536;
                }
            } else {
                // Insert before overTask
                const prevTask = columnTasks[overIndex - 1];
                if (prevTask) {
                    newPosition = (prevTask.position + overTask.position) / 2;
                } else {
                    newPosition = overTask.position / 2;
                }
            }
        }
    }

    // Optimistic UI Update
    const newTasks = tasks.map(t => {
        if (t.id === activeId) {
            return { ...t, status: newStatus, position: newPosition };
        }
        return t;
    }).sort((a, b) => a.position - b.position);
    setTasks(newTasks);

    // Persist. If the server rejects the move, restore the pre-drag
    // snapshot (the optimistic preview would otherwise leave phantom state)
    // and surface the failure instead of silently diverging from the truth.
    const rollbackSnapshot = dragStartSnapshotRef.current;
    moveTaskMutation.mutate(
      {
        taskId: activeId as string,
        status: newStatus,
        position: newPosition
      },
      {
        onSuccess: () => {
          setMoveError(null);
        },
        onError: (error: any) => {
          if (rollbackSnapshot) setTasks(rollbackSnapshot);
          const apiMessage = error?.response?.data?.error?.message;
          setMoveError(
            typeof apiMessage === 'string' && apiMessage.length > 0
              ? `Move failed: ${apiMessage}`
              : 'Could not move this task. The board has been restored.'
          );
        },
      }
    );
  };

  return (
    // RESPONSIVE FIX: tighter gutters on phones (columns peek to hint scrollability),
    // min-h-0 so the flex child can actually shrink and scroll horizontally.
    // ALL drag-and-drop logic (sensors, collision detection, handlers) is unchanged.
    <div className="relative flex h-full min-h-0 gap-4 overflow-x-auto pb-4 sm:gap-6">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        {COLUMNS.map(status => (
          <KanbanColumn
            key={status}
            status={status}
            tasks={tasks.filter(t => t.status === status).sort((a, b) => a.position - b.position)}
          />
        ))}

        <DragOverlay>
          {activeTask ? <TaskCard task={activeTask} /> : null}
        </DragOverlay>
      </DndContext>

      {/* Honest failure surface: shown only when a persist PATCH was rejected
          and the board was rolled back (previously the failure was silent). */}
      {moveError && (
        <div
          role="alert"
          className="absolute bottom-3 right-3 z-20 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 shadow-md dark:border-red-900/50 dark:bg-red-900/40 dark:text-red-300"
        >
          <span>{moveError}</span>
          <button
            type="button"
            aria-label="Dismiss move failure"
            onClick={() => setMoveError(null)}
            className="font-semibold text-red-500 hover:text-red-700 dark:hover:text-red-200"
          >
            &times;
          </button>
        </div>
      )}
    </div>
  );
};
