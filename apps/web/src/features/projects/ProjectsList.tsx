import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { Search, Plus, Filter, LayoutGrid, List, X, FolderKanban } from 'lucide-react';
import { Card, CardBody } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { useAuth } from '../../providers/AuthProvider';

/*
 * UI PASS (#UI-projects-list-nits, 2026-08-07): nit alignment only — the
 * page already met the cluster standard (skeleton loading, honest failure
 * panel, dialog semantics, ESC, segmented toggle). Changes, all visual/
 * a11y with zero logic impact: toolbar icons optically centred in their
 * h-10-equivalent fields (same -translate-y-1/2 pattern as TasksPage
 * Round 3) and made non-interactive/aria-hidden; segmented view-toggle
 * buttons gain a focus-visible ring; the create modal's first field
 * autofocuses (parity with the CRM cluster, disclosed there too).
 * Status hue map deliberately PRESERVED (semantic statuses, same rule
 * as the Leads page in Round 5). Locks: 'We couldn't load your projects'
 * + Retry + 'No projects found' (ListQueryErrorStates) — untouched.
 */

// Utility for status colors — SAME mapping logic as before, now with dark-mode
// variants so the badges are legible in both themes (presentation only).
const getStatusColor = (status: string) => {
  const map: Record<string, string> = {
    PLANNING: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
    ACTIVE: 'bg-green-100 text-green-800 dark:bg-emerald-900/40 dark:text-emerald-300',
    ON_HOLD: 'bg-yellow-100 text-yellow-800 dark:bg-amber-900/40 dark:text-amber-300',
    COMPLETED: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300',
    ARCHIVED: 'bg-gray-100 text-gray-800 dark:bg-slate-700 dark:text-gray-300',
  };
  return map[status] || map.PLANNING;
};

export const ProjectsList = () => {
  // --- Existing state: untouched ---
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null); // inline create-form failure (Bug #28)

  // Form State
  const [name, setName] = useState('');
  const [key, setKey] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState('PLANNING');
  const { user } = useAuth();

  const canCreateProject =
    user?.role === 'SUPER_ADMIN' ||
    user?.role === 'ADMIN';

  const queryClient = useQueryClient();

  /*
   * --- Existing query logic (key + fn): untouched ---
   * BUG FIX (read-side lie — failed GET rendered a fake empty state): this
   * query surfaced only `isLoading`, so a rejected GET /projects (500, 401
   * expiry, network down) fell through to `projects.length === 0` and the
   * page rendered "No projects found — get started by creating your first
   * project.", telling the user their projects were wiped when the server
   * had simply failed. We now expose `isError`/`error`/`refetch` and render
   * an honest failure panel (server message + Retry) before the
   * empty/success branches. Same pattern as the Bug #31 tasks fix.
   */
  const { data, isLoading, isError, error: projectsError, refetch } = useQuery({
    queryKey: ['projects', search, statusFilter],
    queryFn: async () => {
      const res = await api.get('/projects', {
        params: { search: search || undefined, status: statusFilter || undefined }
      });
      return res.data;
    },
  });

  const projectsErrorMessage = (() => {
    const m = (projectsError as any)?.response?.data?.error?.message;
    return typeof m === 'string' && m.length > 0 ? m : null;
  })();

  const projects = Array.isArray(data?.data?.projects)
    ? data.data.projects
    : [];

  // --- Existing mutation + reset cycle: untouched ---
  const createProjectMutation = useMutation({
    mutationFn: async (payload: { name: string; key: string; description?: string; status?: string }) => {
      const res = await api.post('/projects', payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      setIsModalOpen(false);
      setName('');
      setKey('');
      setDescription('');
      setStatus('PLANNING');
    },
  });

  // --- Existing submit handler (incl. auto-key logic below in the input): untouched ---
  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !key.trim()) return;

    // BUG FIX (silent create failures): a duplicate project key (409) or
    // validation error used to freeze the modal with no feedback.
    setFormError(null);
    createProjectMutation.mutate(
      {
        name,
        key: key.toUpperCase(),
        description: description || undefined,
        status,
      },
      {
        onSuccess: () => setFormError(null),
        onError: (error: any) => {
          const apiMessage = error?.response?.data?.error?.message;
          setFormError(
            typeof apiMessage === 'string' && apiMessage.length > 0
              ? apiMessage
              : 'Failed to create the project. Please check the details and try again.'
          );
        },
      }
    );
  };

  // Accessibility (additive): Escape closes the create modal.
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
    <div className="space-y-6">
      {/* Page header — stacks on mobile, action button goes full width */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">Projects</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Manage your organization's projects.</p>
        </div>
        {canCreateProject && (
          <Button variant="primary" className="w-full sm:w-auto" onClick={() => { setFormError(null); setIsModalOpen(true); }}>
            <Plus className="w-4 h-4 mr-2" />
            New Project
          </Button>
        )}
      </div>

      {/* Toolbar — search and filter stack on phones; segmented view toggle */}
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:gap-4">
          <div className="relative w-full sm:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" aria-hidden="true" />
            <input
              type="text"
              placeholder="Search projects..."
              aria-label="Search projects"
              className={`${fieldClass} pl-10 dark:bg-slate-800`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="relative w-full sm:w-48">
            <Filter className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" aria-hidden="true" />
            <select
              aria-label="Filter by status"
              className={`${fieldClass} appearance-none pl-9 dark:bg-slate-800`}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">All Statuses</option>
              <option value="PLANNING">Planning</option>
              <option value="ACTIVE">Active</option>
              <option value="ON_HOLD">On Hold</option>
              <option value="COMPLETED">Completed</option>
            </select>
          </div>
        </div>

        {/* View mode segmented control — original setViewMode handlers */}
        <div className="flex self-start rounded-lg border border-gray-200 bg-gray-100 p-1 dark:border-slate-700 dark:bg-slate-800">
          <button
            type="button"
            aria-label="Grid view"
            aria-pressed={viewMode === 'grid'}
            onClick={() => setViewMode('grid')}
            className={`rounded-md p-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ${
              viewMode === 'grid'
                ? 'bg-white text-gray-900 shadow-sm dark:bg-slate-700 dark:text-white'
                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
          <button
            type="button"
            aria-label="List view"
            aria-pressed={viewMode === 'table'}
            onClick={() => setViewMode('table')}
            className={`rounded-md p-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ${
              viewMode === 'table'
                ? 'bg-white text-gray-900 shadow-sm dark:bg-slate-700 dark:text-white'
                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
          >
            <List className="w-4 h-4" />
          </button>
        </div>
      </div>

      {isLoading ? (
        // Skeleton grid replaces the bare "Loading projects..." text
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3" aria-busy="true" aria-label="Loading projects">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}>
              <CardBody className="animate-pulse space-y-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-gray-200 dark:bg-slate-700" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 w-2/3 rounded bg-gray-200 dark:bg-slate-700" />
                    <div className="h-2 w-1/3 rounded bg-gray-200 dark:bg-slate-700" />
                  </div>
                </div>
                <div className="h-2 w-full rounded bg-gray-200 dark:bg-slate-700" />
                <div className="h-2 w-5/6 rounded bg-gray-200 dark:bg-slate-700" />
              </CardBody>
            </Card>
          ))}
        </div>
      ) : isError ? (
        // Honest failure panel — never render the "No projects found" empty
        // state when the GET actually failed (see query comment above).
        <div
          role="alert"
          className="flex flex-col items-center rounded-xl border border-red-200 bg-red-50/60 px-6 py-16 text-center shadow-sm dark:border-red-900/50 dark:bg-red-900/10"
        >
          <h3 className="mb-1 text-lg font-medium text-gray-900 dark:text-white">We couldn't load your projects</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {projectsErrorMessage ?? 'Something went wrong while fetching your projects. Your data is safe — please try again.'}
          </p>
          <Button variant="primary" className="mt-4" onClick={() => refetch()}>
            Retry
          </Button>
        </div>
      ) : projects.length === 0 ? (
        // Friendlier empty state — same condition, same Create handler
        <Card>
          <CardBody className="flex flex-col items-center py-16 text-center">
            <span className="mb-4 rounded-2xl bg-primary-50 p-4 dark:bg-primary-900/30">
              <FolderKanban className="h-8 w-8 text-primary-400" />
            </span>
            <h3 className="mb-2 text-lg font-medium text-gray-900 dark:text-white">No projects found</h3>
            <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">Get started by creating your first project.</p>
            {canCreateProject && (
              <Button variant="primary" onClick={() => { setFormError(null); setIsModalOpen(true); }}>
                Create Project
              </Button>
            )}
          </CardBody>
        </Card>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {projects.map((project: any) => (
            <Card key={project.id} className="cursor-pointer transition-shadow hover:shadow-md">
              <CardBody className="flex h-full flex-col">
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    {/* Project key tile — branded instead of plain gray */}
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-xs font-bold text-primary-700 dark:bg-primary-900/40 dark:text-primary-300">
                      {project.key}
                    </div>
                    <div className="min-w-0">
                      <h3 className="truncate font-semibold text-gray-900 dark:text-white">{project.name}</h3>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{project.key}</p>
                    </div>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${getStatusColor(project.status)}`}>
                    {project.status}
                  </span>
                </div>
                <p className="mb-6 line-clamp-2 flex-1 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
                  {project.description || 'No description provided.'}
                </p>
                <div className="mt-auto flex items-center justify-between gap-2 border-t border-gray-100 pt-4 text-xs text-gray-500 dark:border-slate-700 dark:text-gray-400">
                  <span className="truncate">Owner: {project.owner?.firstName || 'Admin'}</span>
                  <span className="shrink-0 tabular-nums">Created: {new Date(project.createdAt).toLocaleDateString()}</span>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      ) : (
        // Table view — horizontally scrollable on small screens
        <div className="overflow-x-auto rounded-xl border border-gray-200/80 bg-white shadow-sm dark:border-slate-700/80 dark:bg-slate-800">
          <table className="w-full min-w-[640px] text-left text-sm text-gray-500 dark:text-gray-400">
            <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wide text-gray-700 dark:border-slate-700 dark:bg-slate-900 dark:text-gray-300">
              <tr>
                <th className="px-6 py-4 font-semibold">Project</th>
                <th className="px-6 py-4 font-semibold">Key</th>
                <th className="px-6 py-4 font-semibold">Status</th>
                <th className="px-6 py-4 font-semibold">Owner</th>
                <th className="px-6 py-4 font-semibold">Created Date</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((project: any) => (
                <tr key={project.id} className="cursor-pointer border-b border-gray-100 transition-colors last:border-0 hover:bg-gray-50 dark:border-slate-700 dark:hover:bg-slate-700/50">
                  <td className="px-6 py-4 font-medium text-gray-900 dark:text-white">{project.name}</td>
                  <td className="px-6 py-4">{project.key}</td>
                  <td className="px-6 py-4">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${getStatusColor(project.status)}`}>
                      {project.status}
                    </span>
                  </td>
                  <td className="px-6 py-4">{project.owner?.firstName || 'Admin'} {project.owner?.lastName || ''}</td>
                  <td className="whitespace-nowrap px-6 py-4 tabular-nums">{new Date(project.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Project Modal — same form, same handlers; adds backdrop click + blur */}
      {isModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm"
          onClick={() => setIsModalOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-project-title"
            className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-xl sm:p-8 dark:border-slate-700 dark:bg-slate-800"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-5 flex items-center justify-between">
              <h3 id="create-project-title" className="text-lg font-semibold text-gray-900 dark:text-white">Create New Project</h3>
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
                <label htmlFor="project-name" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Project Name *</label>
                <input
                  id="project-name"
                  type="text"
                  required
                  autoFocus
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (!key) {
                      setKey(e.target.value.replace(/[^a-zA-Z0-9]/g, '').slice(0, 5).toUpperCase());
                    }
                  }}
                  className={fieldClass}
                  placeholder="Website Redesign"
                />
              </div>
              <div>
                <label htmlFor="project-key" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Project Key (2-10 uppercase letters/numbers) *</label>
                <input
                  id="project-key"
                  type="text"
                  required
                  maxLength={10}
                  value={key}
                  onChange={(e) => setKey(e.target.value.toUpperCase())}
                  className={`${fieldClass} uppercase`}
                  placeholder="WEB"
                />
              </div>
              <div>
                <label htmlFor="project-description" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Description</label>
                <textarea
                  id="project-description"
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className={fieldClass}
                  placeholder="Description of project objectives..."
                />
              </div>
              <div>
                <label htmlFor="project-status" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Initial Status</label>
                <select
                  id="project-status"
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className={fieldClass}
                >
                  <option value="PLANNING">Planning</option>
                  <option value="ACTIVE">Active</option>
                  <option value="ON_HOLD">On Hold</option>
                </select>
              </div>
              {formError && (
                <p role="alert" className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/50 rounded-md px-3 py-2">
                  {formError}
                </p>
              )}
              <div className="flex justify-end gap-2 border-t border-gray-100 pt-4 dark:border-slate-700">
                <Button type="button" variant="secondary" onClick={() => { setIsModalOpen(false); setFormError(null); }}>Cancel</Button>
                <Button type="submit" variant="primary" disabled={createProjectMutation.isPending}>
                  {createProjectMutation.isPending ? 'Creating...' : 'Create Project'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
