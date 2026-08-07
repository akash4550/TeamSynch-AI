import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { Search, Plus, X } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { TeamCard } from './components/TeamCard';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../providers/AuthProvider';

/*
 * UI PASS (#UI-teams-page, 2026-08-08): visual/a11y alignment to the
 * cluster standard. Zero logic impact: query keys, mutation, handlers,
 * form state, and every string are byte-identical (locks in
 * ListQueryErrorStates: 'We couldn't load your teams' + Retry +
 * 'No teams found').
 *
 * Changes: responsive cluster header; h-10 labelled search field with an
 * optically-centred non-interactive icon and primary focus tokens (was
 * unlabelled, blue-*, top-2.5 icon); 'Loading teams...' gains
 * role="status" + spinner; the create modal gains full dialog semantics
 * (role="dialog" + aria-modal + aria-labelledby), backdrop blur +
 * backdrop-click + ESC close (parity with ProjectsList — additive),
 * htmlFor/id-wired labels, aria-label on the close button, autoFocus on
 * the first field, and an accessible name on the color swatch input.
 * lucide icon set kept (this feature is lucide-native; no icon churn).
 */

const fieldClass =
  'h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/40 dark:border-slate-600 dark:bg-slate-700 dark:text-gray-100 dark:placeholder:text-gray-500';

const labelClass = 'mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300';

export const TeamsPage = () => {
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null); // inline create-form failure (Bug #28)

  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState('#3B82F6');
  const { user } = useAuth();

  const canManageTeams =
    user?.role === 'SUPER_ADMIN' ||
    user?.role === 'ADMIN';

  const navigate = useNavigate();
  const queryClient = useQueryClient();

  /*
   * BUG FIX (read-side lie — failed GET rendered a fake empty state): this
   * query surfaced only `isLoading`, so a rejected GET /teams (500, 401
   * expiry, network down) fell through to `teams.length === 0` and the page
   * rendered "No teams found — Create a team to start collaborating.",
   * telling the user their teams were wiped when the server had simply
   * failed. We now expose `isError`/`error`/`refetch` and render an honest
   * failure panel (server message + Retry) before the empty/success
   * branches. Same pattern as the Bug #31 tasks fix.
   */
  const { data, isLoading, isError, error: teamsError, refetch } = useQuery({
    queryKey: ['teams', search],
    queryFn: async () => {
      const res = await api.get('/teams', {
        params: { search: search || undefined }
      });
      return res.data;
    },
  });

  const teamsErrorMessage = (() => {
    const m = (teamsError as any)?.response?.data?.error?.message;
    return typeof m === 'string' && m.length > 0 ? m : null;
  })();

  const teams = Array.isArray(data?.data?.teams)
    ? data.data.teams
    : [];

  const createTeamMutation = useMutation({
    mutationFn: async (payload: { name: string; description?: string; color?: string }) => {
      const res = await api.post('/teams', payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      setIsModalOpen(false);
      setName('');
      setDescription('');
    },
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    // BUG FIX (silent create failures): team creation rejections used to
    // freeze the modal with no feedback; surfaced inline now from the
    // shared `{ error: { message } }` envelope (string-only).
    setFormError(null);
    createTeamMutation.mutate(
      {
        name,
        description: description || undefined,
        color,
      },
      {
        onSuccess: () => setFormError(null),
        onError: (error: any) => {
          const apiMessage = error?.response?.data?.error?.message;
          setFormError(
            typeof apiMessage === 'string' && apiMessage.length > 0
              ? apiMessage
              : 'Failed to create the team. Please check the details and try again.'
          );
        },
      }
    );
  };

  // ESC closes the create modal (parity with ProjectsList — additive).
  useEffect(() => {
    if (!isModalOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsModalOpen(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isModalOpen]);

  const closeModal = () => {
    setIsModalOpen(false);
    setFormError(null);
  };

  return (
    <div className="space-y-6">
      {/* Page header — stacks on mobile like every other list page */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Teams</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Manage your organization's teams and members.</p>
        </div>
        {canManageTeams && (
          <Button variant="primary" className="w-full sm:w-auto" onClick={() => { setFormError(null); setIsModalOpen(true); }}>
            <Plus className="w-4 h-4 mr-2" />
            Create Team
          </Button>
        )}
      </div>

      {/* Search — programmatically labelled; icon optically centred; h-10 */}
      <div className="w-full max-w-sm">
        <label htmlFor="team-search" className="sr-only">
          Search teams
        </label>
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500"
            aria-hidden="true"
          />
          <input
            id="team-search"
            type="text"
            placeholder="Search teams..."
            className={`${fieldClass} pl-10`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {isLoading ? (
        <div role="status" className="flex items-center justify-center gap-2 py-12 text-sm text-gray-500 dark:text-gray-400">
          <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          Loading teams...
        </div>
      ) : isError ? (
        // Honest failure panel — never render the "No teams found" empty
        // state when the GET actually failed (see query comment above).
        <div
          role="alert"
          className="text-center py-16 bg-white dark:bg-slate-800 rounded-lg border border-red-200 dark:border-red-900/50"
        >
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">We couldn't load your teams</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
            {teamsErrorMessage ?? 'Something went wrong while fetching your teams. Your data is safe — please try again.'}
          </p>
          <Button variant="primary" onClick={() => refetch()}>
            Retry
          </Button>
        </div>
      ) : teams.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-slate-800 rounded-lg border border-dashed border-gray-300 dark:border-slate-700">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No teams found</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">Create a team to start collaborating.</p>
          {canManageTeams && (
            <Button variant="primary" onClick={() => { setFormError(null); setIsModalOpen(true); }}>
              Create Team
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {teams.map((team: any) => (
            <TeamCard
              key={team.id}
              team={team}
              onClick={(id) => navigate(`/teams/${id}`)}
            />
          ))}
        </div>
      )}

      {/* Create Team Modal — dialog semantics + backdrop/ESC dismissal */}
      {isModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm"
          onClick={closeModal}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-team-title"
            className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-slate-800"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 id="create-team-title" className="text-lg font-semibold text-gray-900 dark:text-white">Create New Team</h3>
              <button
                type="button"
                aria-label="Close dialog"
                onClick={closeModal}
                className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:hover:bg-slate-700 dark:hover:text-gray-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label htmlFor="team-name" className={labelClass}>Team Name *</label>
                <input
                  id="team-name"
                  type="text"
                  required
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={fieldClass}
                  placeholder="Engineering / Sales / Product"
                />
              </div>
              <div>
                <label htmlFor="team-description" className={labelClass}>Description</label>
                <textarea
                  id="team-description"
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className={`${fieldClass} h-auto py-2.5`}
                  placeholder="Responsibilities and domain of this team..."
                />
              </div>
              <div>
                <label htmlFor="team-color" className={labelClass}>Team Badge Color</label>
                <div className="flex items-center gap-2">
                  <input
                    id="team-color"
                    type="color"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    aria-describedby="team-color-value"
                    className="h-10 w-10 cursor-pointer rounded border border-gray-300 dark:border-slate-600"
                  />
                  <span id="team-color-value" className="font-mono text-xs text-gray-500 dark:text-gray-400">{color}</span>
                </div>
              </div>
              {formError && (
                <p role="alert" className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/50 rounded-md px-3 py-2">
                  {formError}
                </p>
              )}
              <div className="flex justify-end gap-2 border-t border-gray-100 pt-4 dark:border-slate-700">
                <Button type="button" variant="secondary" onClick={closeModal}>Cancel</Button>
                <Button type="submit" variant="primary" disabled={createTeamMutation.isPending}>
                  {createTeamMutation.isPending ? 'Creating...' : 'Create Team'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
