import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { KanbanBoard } from './components/KanbanBoard';
import { Search, Plus, List, LayoutGrid, X, CheckSquare } from 'lucide-react';
import { Button } from '../../components/ui/Button';

// Presentation-only pill maps for the LIST view (raw values rendered stay identical)
const statusPill: Record<string, string> = {
  BACKLOG: 'bg-gray-100 text-gray-700 dark:bg-slate-700 dark:text-gray-300',
  TODO: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  IN_PROGRESS: 'bg-yellow-100 text-yellow-800 dark:bg-amber-900/40 dark:text-amber-300',
  IN_REVIEW: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300',
  DONE: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
};

const priorityPill: Record<string, string> = {
  LOW: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  MEDIUM: 'bg-yellow-100 text-yellow-800 dark:bg-amber-900/40 dark:text-amber-300',
  HIGH: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300',
  CRITICAL: 'bg-red-100 text-red-800 dark:bg-rose-900/40 dark:text-rose-300',
};

export const TasksPage = () => {
  // --- Existing state: untouched ---
  const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban');
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null); // inline create-form failure (Bug #28)

  // Task Creation State
  const [projectId, setProjectId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState('TODO');
  const [priority, setPriority] = useState('MEDIUM');
  const [estimatedHours, setEstimatedHours] = useState<number | undefined>();

  const queryClient = useQueryClient();

  // --- Existing queries: untouched ---
  /*
   * BUG FIX (misleading empty state on query failure): the tasks query
   * surfaced only `isLoading`, so a rejected GET (500, network down, 403)
   * fell through to the empty branches — the kanban view showed an EMPTY
   * BOARD and the list view showed "No tasks found. Create your first
   * task", telling the user their data was wiped when the server simply
   * failed. The query now exposes `isError`/`refetch` and renders an
   * honest failure panel (with a Retry action and the server's message
   * when available) before any of the success/empty branches.
   */
  const { data, isLoading, isError, error: tasksError, refetch } = useQuery({
    queryKey: ['tasks', search],
    queryFn: async () => {
      const res = await api.get('/tasks', {
        params: { search: search || undefined }
      });
      return res.data;
    },
  });

  // Optional server reason for the failure panel (`{ error: { message } }`
  // envelope, string-only).
  const tasksErrorMessage = (() => {
    const m = (tasksError as any)?.response?.data?.error?.message;
    return typeof m === 'string' && m.length > 0 ? m : null;
  })();

  /*
   * BUG FIX (React Query key collision / cache poisoning): this page used
   * the bare key ['projects'] with NO limit param and stored the UNWRAPPED
   * `res.data.data` shape, while Dashboard used the SAME key with
   * `limit: 100` and stored the wrapped `res.data` shape. Same key + two
   * different queryFns + two different stored shapes = cross-page cache
   * poisoning: whoever mounted first decided what the other consumer saw —
   * Dashboard-first made this project select EMPTY (task creation
   * impossible), TasksPage-first emptied Dashboard's tiles. Both pages now
   * share one param-aware key, one request (limit: 500 since the ledger #6
   * aggregate-cap raise, also fixing the select's silent 20-project cap),
   * and one stored shape.
   */
  const { data: projectsData } = useQuery({
    queryKey: ['projects', { limit: 500 }],
    queryFn: async () => {
      const res = await api.get('/projects', { params: { limit: 500 } });
      return res.data.data;
    },
  });

  const projects = Array.isArray(projectsData?.projects)
    ? projectsData.projects
    : [];

  // --- Existing mutation + reset cycle: untouched ---
  const createTaskMutation = useMutation({
    mutationFn: async (payload: {
      projectId: string;
      title: string;
      description?: string;
      status?: string;
      priority?: string;
      estimatedHours?: number;
    }) => {
      const res = await api.post('/tasks', payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      setIsModalOpen(false);
      setTitle('');
      setDescription('');
      setStatus('TODO');
      setPriority('MEDIUM');
      setEstimatedHours(undefined);
    },
  });

  // --- Existing submit handler: untouched ---
  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !projectId) return;

    // BUG FIX (silent create failures): task creation rejections (invalid
    // project, validation 400) used to freeze the modal with no feedback.
    // Surface them inline from the shared `{ error: { message } }` envelope.
    setFormError(null);
    createTaskMutation.mutate(
      {
        projectId,
        title,
        description: description || undefined,
        status,
        priority,
        estimatedHours,
      },
      {
        onSuccess: () => setFormError(null),
        onError: (error: any) => {
          const apiMessage = error?.response?.data?.error?.message;
          setFormError(
            typeof apiMessage === 'string' && apiMessage.length > 0
              ? apiMessage
              : 'Failed to create the task. Please check the details and try again.'
          );
        },
      }
    );
  };

  // Accessibility (additive): Escape closes the create modal
  useEffect(() => {
    if (!isModalOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsModalOpen(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isModalOpen]);

  // Shared input styling (visual only)
  const fieldClass =
    'w-full rounded-lg border border-gray-300 px-3.5 py-2.5 text-sm text-gray-900 outline-none transition-shadow placeholder:text-gray-400 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 dark:border-slate-600 dark:bg-slate-700 dark:text-white dark:placeholder:text-gray-400';

  return (
    <div className="flex h-full flex-col space-y-6">
      {/* Page header — stacks on mobile, action button goes full width */}
      <div className="flex shrink-0 flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">Tasks</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Manage work across your active projects.</p>
        </div>
        <Button variant="primary" className="w-full sm:w-auto" onClick={() => { setFormError(null); setIsModalOpen(true); }}>
          <Plus className="w-4 h-4 mr-2" />
          Create Task
        </Button>
      </div>

      {/* Toolbar — search goes full width on phones; segmented view toggle */}
      <div className="flex shrink-0 flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
          <input
            type="text"
            placeholder="Search tasks..."
            aria-label="Search tasks"
            className={`${fieldClass} pl-10 dark:bg-slate-800`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="flex self-start rounded-lg border border-gray-200 bg-gray-100 p-1 dark:border-slate-700 dark:bg-slate-800">
          <button
            type="button"
            aria-label="Kanban view"
            aria-pressed={viewMode === 'kanban'}
            onClick={() => setViewMode('kanban')}
            className={`rounded-md p-2 transition-colors ${
              viewMode === 'kanban'
                ? 'bg-white text-gray-900 shadow-sm dark:bg-slate-700 dark:text-white'
                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
          <button
            type="button"
            aria-label="List view"
            aria-pressed={viewMode === 'list'}
            onClick={() => setViewMode('list')}
            className={`rounded-md p-2 transition-colors ${
              viewMode === 'list'
                ? 'bg-white text-gray-900 shadow-sm dark:bg-slate-700 dark:text-white'
                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
          >
            <List className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        {isLoading ? (
          // Column-shaped skeleton replaces the bare "Loading tasks..." text
          <div className="flex h-full gap-4 overflow-hidden sm:gap-6" aria-busy="true" aria-label="Loading tasks">
            {Array.from({ length: 5 }).map((_, col) => (
              <div key={col} className="flex w-72 shrink-0 flex-col gap-3 rounded-xl border border-gray-200/80 bg-gray-100/60 p-3 sm:w-80 dark:border-slate-700/80 dark:bg-slate-800/60">
                <div className="h-4 w-24 animate-pulse rounded bg-gray-200 dark:bg-slate-700" />
                {Array.from({ length: col % 2 === 0 ? 3 : 2 }).map((_, row) => (
                  <div key={row} className="h-24 animate-pulse rounded-lg bg-white shadow-sm dark:bg-slate-800" />
                ))}
              </div>
            ))}
          </div>
        ) : isError ? (
          // Honest failure surface — never render an empty board as if the
          // user's tasks were deleted when the server actually erred.
          <div
            role="alert"
            className="flex h-full flex-col items-center justify-center rounded-xl border border-red-200 bg-red-50/60 text-center shadow-sm dark:border-red-900/50 dark:bg-red-900/10"
          >
            <span className="mb-4 rounded-2xl bg-red-100 p-4 dark:bg-red-900/40">
              <X className="h-8 w-8 text-red-500 dark:text-red-400" />
            </span>
            <h3 className="mb-1 text-lg font-medium text-gray-900 dark:text-white">We couldn't load your tasks</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {tasksErrorMessage ?? 'Something went wrong while fetching your tasks. Your data is safe — please try again.'}
            </p>
            <Button variant="primary" className="mt-4" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        ) : viewMode === 'kanban' ? (
          /* ORIGINAL prop drilling — untouched */
          <KanbanBoard tasks={data?.data || []} />
        ) : !data?.data || data.data.length === 0 ? (
          // Friendly empty state for the list view
          <div className="flex h-full flex-col items-center justify-center rounded-xl border border-gray-200/80 bg-white text-center shadow-sm dark:border-slate-700/80 dark:bg-slate-800">
            <span className="mb-4 rounded-2xl bg-primary-50 p-4 dark:bg-primary-900/30">
              <CheckSquare className="h-8 w-8 text-primary-400" />
            </span>
            <h3 className="mb-1 text-lg font-medium text-gray-900 dark:text-white">No tasks found</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">Create your first task to get started.</p>
          </div>
        ) : (
          // List view — horizontally scrollable on small screens
          <div className="h-full overflow-auto rounded-xl border border-gray-200/80 bg-white shadow-sm dark:border-slate-700/80 dark:bg-slate-800">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wide text-gray-500 dark:border-slate-700 dark:bg-slate-900 dark:text-gray-400">
                <tr>
                  <th className="px-6 py-4 font-semibold">Task</th>
                  <th className="px-6 py-4 font-semibold">Status</th>
                  <th className="px-6 py-4 font-semibold">Priority</th>
                  <th className="px-6 py-4 font-semibold">Assignee</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                {data?.data?.map((task: any) => (
                  <tr key={task.id} className="transition-colors hover:bg-gray-50 dark:hover:bg-slate-700/50">
                    <td className="px-6 py-4">
                      <div className="font-medium text-gray-900 dark:text-white">{task.title}</div>
                      <div className="mt-0.5 font-mono text-xs text-gray-500 dark:text-gray-400">{task.project?.key || 'TSK'}-{task.id.slice(0, 4)}</div>
                    </td>
                    <td className="px-6 py-4">
                      {/* Same raw value, now as a legible pill in both themes */}
                      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusPill[task.status] || statusPill.BACKLOG}`}>
                        {task.status}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${priorityPill[task.priority] || priorityPill.MEDIUM}`}>
                        {task.priority}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-gray-700 dark:text-gray-300">{task.assignee?.firstName || 'Unassigned'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Task Modal — same form/handlers; adds backdrop click + blur + linked labels */}
      {isModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm"
          onClick={() => setIsModalOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-task-title"
            className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-gray-200 bg-white p-6 shadow-xl sm:p-8 dark:border-slate-700 dark:bg-slate-800"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-5 flex items-center justify-between">
              <h3 id="create-task-title" className="text-lg font-semibold text-gray-900 dark:text-white">Create New Task</h3>
              <button
                type="button"
                aria-label="Close dialog"
                onClick={() => setIsModalOpen(false)}
                className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-slate-700 dark:hover:text-gray-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            {/* ORIGINAL form with the exact same onSubmit and per-field onChange logic */}
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label htmlFor="task-project" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Project *</label>
                <select
                  id="task-project"
                  required
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  className={fieldClass}
                >
                  <option value="">Select Project...</option>
                  {projects.map((p: any) => (
                    <option key={p.id} value={p.id}>{p.name} ({p.key})</option>
                  ))}
                </select>
                {/* FEATURE (ledger #6 — truncation honesty): the picker
                    lists the fetched page; a 501st+ project must not
                    masquerade as nonexistent. */}
                {(projectsData?.total ?? 0) > projects.length && (
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Showing the first {projects.length} of {projectsData?.total} projects.
                  </p>
                )}
              </div>
              <div>
                <label htmlFor="task-title" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Task Title *</label>
                <input
                  id="task-title"
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className={fieldClass}
                  placeholder="Design Landing Hero Section"
                />
              </div>
              <div>
                <label htmlFor="task-description" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Description</label>
                <textarea
                  id="task-description"
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className={fieldClass}
                  placeholder="Task details and acceptance criteria..."
                />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="task-status" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Status</label>
                  <select
                    id="task-status"
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    className={fieldClass}
                  >
                    <option value="BACKLOG">Backlog</option>
                    <option value="TODO">To Do</option>
                    <option value="IN_PROGRESS">In Progress</option>
                    <option value="IN_REVIEW">In Review</option>
                    <option value="DONE">Done</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="task-priority" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Priority</label>
                  <select
                    id="task-priority"
                    value={priority}
                    onChange={(e) => setPriority(e.target.value)}
                    className={fieldClass}
                  >
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                    <option value="CRITICAL">Critical</option>
                  </select>
                </div>
              </div>
              <div>
                <label htmlFor="task-hours" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Estimated Hours</label>
                <input
                  id="task-hours"
                  type="number"
                  min="0"
                  step="0.5"
                  value={estimatedHours || ''}
                  onChange={(e) => setEstimatedHours(e.target.value ? Number(e.target.value) : undefined)}
                  className={fieldClass}
                  placeholder="8"
                />
              </div>
              {formError && (
                <p role="alert" className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/50 rounded-md px-3 py-2">
                  {formError}
                </p>
              )}
              <div className="flex justify-end gap-2 border-t border-gray-100 pt-4 dark:border-slate-700">
                <Button type="button" variant="secondary" onClick={() => { setIsModalOpen(false); setFormError(null); }}>Cancel</Button>
                <Button type="submit" variant="primary" disabled={createTaskMutation.isPending}>
                  {createTaskMutation.isPending ? 'Creating...' : 'Create Task'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
