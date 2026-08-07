import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { Search, Plus, Filter, X, ChevronDown } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';

/*
 * UI PASS (#UI-users-management, 2026-08-07): visual-only alignment of the
 * /users admin surface with the shared design system — page-level cluster
 * header (h1 + muted description, single primary action), labelled h-10
 * search + role filter with primary focus rings, semantic table (banded
 * header, divide-y rows, ring pill for roles, AA status dots), dialog
 * semantics on the create-user modal (role=dialog/aria-modal/labelledby,
 * backdrop-click + ESC close, autofocus, focus rings), and blue-* ->
 * primary-* accents. No behavioral change: query keys/params, mutation
 * payload, #89 guards, reset-page-on-filter, and every copy string pinned
 * by UserManagement.test.tsx and ListQueryErrorStates.test.tsx
 * ("Add User" x2, "Add New User", "Cancel", "We couldn't load your users",
 * "No users found.", placeholder employee@company.com) is verbatim.
 */

// Shared field chrome (mirrors the CRM/tasks filter inputs).
const fieldClass =
  'h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 placeholder-gray-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/40 dark:border-slate-600 dark:bg-slate-700 dark:text-white dark:placeholder-gray-500';

export const UserManagement = () => {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [roleFilter, setRoleFilter] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Form State
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('EMPLOYEE');
  const [password, setPassword] = useState('');

  /*
   * BUG FIX (silent user-creation failures): createUserMutation had NO
   * onError, so every server rejection — duplicate email (409), password
   * shorter than 8 chars (400), invalid email, 1-char names — was
   * completely invisible: admins clicked "Add User" and the modal just sat
   * there, no message, no close, like the app froze. The most common case
   * (inviting an email that already exists) therefore looked exactly like
   * a broken app. Failures now render inline inside the modal with the
   * server's message extracted from the shared `{ error: { message } }`
   * envelope (string-only — same pattern as the Bug #20/#23 fixes).
   */
  const [createError, setCreateError] = useState<string | null>(null);

  const queryClient = useQueryClient();

  /*
   * BUG FIX (read-side lie — failed GET rendered a fake empty state): this
   * query surfaced only `isLoading`, so a rejected GET /users (500, 401
   * expiry, network down) fell through to `users.length === 0` and the
   * table claimed "No users found." — telling an admin the entire user
   * directory was wiped when the server had simply failed. We now expose
   * `isError`/`error`/`refetch` and render an honest failure row (server
   * message + Retry) before the empty/success branches. Same pattern as
   * the Bug #31 tasks fix. (The paginator below already hides on failure:
   * it renders only when `pagination` exists.)
   */
  const { data, isLoading, isError, error: usersError, refetch } = useQuery({
    queryKey: ['users', page, search, roleFilter],
    queryFn: async () => {
      const res = await api.get('/users', {
        params: { page, limit: 10, search: search || undefined, role: roleFilter || undefined }
      });
      return res.data;
    },
  });

  const usersErrorMessage = (() => {
    const m = (usersError as any)?.response?.data?.error?.message;
    return typeof m === 'string' && m.length > 0 ? m : null;
  })();

  const users = Array.isArray(data?.data?.users)
    ? data.data.users
    : [];

  const pagination = data?.data?.pagination;

  const createUserMutation = useMutation({
    mutationFn: async (payload: {
      firstName: string;
      lastName: string;
      email: string;
      role: string;
      password?: string;
    }) => {
      const res = await api.post('/users', payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setIsModalOpen(false);
      setCreateError(null);
      setFirstName('');
      setLastName('');
      setEmail('');
      setRole('EMPLOYEE');
      setPassword('');
    },
    onError: (error: any) => {
      const apiMessage = error?.response?.data?.error?.message;
      setCreateError(
        typeof apiMessage === 'string' && apiMessage.length > 0
          ? apiMessage
          : 'Failed to create the user. Please check the details and try again.'
      );
    },
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim() || !email.trim()) return;
    // BUG FIX (#89): password is genuinely required server-side (400 on
    // omission) — mirror the names/email guard and never send undefined.
    if (password.length < 8) return;
    if (createUserMutation.isPending) return;
    // Clear the previous failure so a fresh attempt reports fresh state.
    setCreateError(null);

    createUserMutation.mutate({
      firstName,
      lastName,
      email,
      role,
      password,
    });
  };

  // Single close path for Cancel / X / backdrop / ESC: always clears the
  // stale inline error so a reopened modal starts clean (locked by the
  // "clears the stale error" regression test).
  const closeModal = () => {
    setIsModalOpen(false);
    setCreateError(null);
  };

  // UI PASS: ESC closes the dialog — parity with the other feature modals.
  useEffect(() => {
    if (!isModalOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeModal();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isModalOpen]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">User Management</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Manage your organization's members and their system roles.
          </p>
        </div>
        <Button onClick={() => setIsModalOpen(true)} className="shrink-0 self-start sm:self-auto">
          <Plus className="mr-2 h-4 w-4" aria-hidden="true" /> Add User
        </Button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <label htmlFor="user-search" className="sr-only">Search users</label>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
          <input
            id="user-search"
            type="text"
            placeholder="Search users..."
            className={`${fieldClass} pl-9`}
            value={search}
            /*
             * BUG FIX (filters appeared "broken" while paginated): changing
             * the search term or role filter previously kept the current
             * `page`, so filtering from page 2+ requested an out-of-range
             * page — the API (no server-side clamp) returned an empty list
             * and the table showed "No users found." while the footer read
             * e.g. "page 4 of 1", even though matches existed on page 1.
             * Both filter handlers now reset pagination to page 1.
             */
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <div className="relative sm:w-48">
          <label htmlFor="user-role-filter" className="sr-only">Filter by role</label>
          <Filter className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
          <select
            id="user-role-filter"
            className={`${fieldClass} appearance-none pl-9 pr-8`}
            value={roleFilter}
            onChange={(e) => {
              setRoleFilter(e.target.value);
              setPage(1); // stay in sync with the search box: filtering always restarts at page 1
            }}
          >
            <option value="">All Roles</option>
            <option value="SUPER_ADMIN">Super Admin</option>
            <option value="ADMIN">Admin</option>
            <option value="MANAGER">Manager</option>
            <option value="EMPLOYEE">Employee</option>
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
        </div>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50/75 dark:border-slate-700 dark:bg-slate-800/80">
                <th scope="col" className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Name</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Email</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Role</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-slate-700/70">
              {isLoading ? (
                <tr>
                  <td colSpan={4} className="px-6 py-10 text-center" role="status">
                    <span className="inline-flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                      <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Loading users...
                    </span>
                  </td>
                </tr>
              ) : isError ? (
                // Honest failure row — never render "No users found." when the
                // GET actually failed (see query comment above).
                <tr>
                  <td colSpan={4} className="px-6 py-8">
                    <div
                      role="alert"
                      className="mx-auto max-w-md rounded-lg border border-red-200 bg-red-50 px-4 py-6 text-center dark:border-red-900/50 dark:bg-red-900/20"
                    >
                      <p className="text-sm font-medium text-red-700 dark:text-red-300">We couldn't load your users</p>
                      <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                        {usersErrorMessage ?? 'Something went wrong while fetching your users. Your data is safe — please try again.'}
                      </p>
                      <Button size="sm" onClick={() => refetch()} className="mt-3">
                        Retry
                      </Button>
                    </div>
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr><td colSpan={4} className="px-6 py-10 text-center text-sm text-gray-500 dark:text-gray-400">No users found.</td></tr>
              ) : (
                users.map((user: any) => (
                  <tr key={user.id} className="hover:bg-gray-50/60 dark:hover:bg-slate-700/40">
                    <td className="px-6 py-4 font-medium text-gray-900 dark:text-white">{user.firstName} {user.lastName}</td>
                    <td className="px-6 py-4 text-gray-600 dark:text-gray-300">{user.email}</td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center rounded-full bg-gray-50 px-2.5 py-0.5 text-xs font-medium text-gray-700 ring-1 ring-inset ring-gray-600/20 dark:bg-slate-700/60 dark:text-gray-200 dark:ring-slate-500/40">
                        {user.role}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {user.isActive ? (
                        <span className="inline-flex items-center gap-1.5 text-sm text-emerald-700 dark:text-emerald-400">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" /> Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400">
                          <span className="h-1.5 w-1.5 rounded-full bg-gray-400" aria-hidden="true" /> Inactive
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {pagination && (
          <div className="flex items-center justify-between border-t border-gray-200 px-6 py-3 dark:border-slate-700">
            <span className="text-sm text-gray-500 dark:text-gray-400">
              Showing page {pagination.page} of {pagination.totalPages || 1}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => p + 1)}
                disabled={page >= (pagination.totalPages || 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Create User Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm" onClick={closeModal}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-user-title"
            className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-slate-800"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 id="create-user-title" className="text-lg font-semibold text-gray-900 dark:text-white">Add New User</h3>
              <button
                type="button"
                onClick={closeModal}
                aria-label="Close"
                className="rounded-md p-1 text-gray-400 transition-colors hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500/40 dark:hover:text-gray-300"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="create-user-first-name" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">First Name *</label>
                  <input
                    id="create-user-first-name"
                    type="text"
                    required
                    autoFocus
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className={fieldClass}
                  />
                </div>
                <div>
                  <label htmlFor="create-user-last-name" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Last Name *</label>
                  <input
                    id="create-user-last-name"
                    type="text"
                    required
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className={fieldClass}
                  />
                </div>
              </div>
              <div>
                <label htmlFor="create-user-email" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Email Address *</label>
                <input
                  id="create-user-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={fieldClass}
                  placeholder="employee@company.com"
                />
              </div>
              <div>
                <label htmlFor="create-user-role" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">System Role</label>
                <select
                  id="create-user-role"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className={fieldClass}
                >
                  <option value="EMPLOYEE">Employee</option>
                  <option value="MANAGER">Manager</option>
                  <option value="ADMIN">Admin</option>
                </select>
              </div>
              <div>
                {/*
                 * BUG FIX (#89 — "auto-generated password" was a lie): the
                 * field was labeled "(Optional)" with placeholder "Leave
                 * empty for auto-generated password", and the payload sent
                 * `password || undefined` — but createUserSchema's optional
                 * password falls straight into UserService.createUser's
                 * `throw 400 'Password is required'`, and no auto-generation
                 * exists anywhere in the stack (with the documented
                 * simulation email boundary there would be no way to deliver
                 * one without locking the account out). Every admin who
                 * believed the copy got a 400. The field is now honestly
                 * required (min 8, matching the server's zod floor), always
                 * sent, and the placeholder states the real rule.
                 */}
                <label htmlFor="create-user-password" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Password *</label>
                <input
                  id="create-user-password"
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={fieldClass}
                  placeholder="Minimum 8 characters"
                />
              </div>
              {createError && (
                <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-400">
                  {createError}
                </p>
              )}
              <div className="flex justify-end gap-2 border-t border-gray-100 pt-4 dark:border-slate-700">
                <Button type="button" variant="outline" onClick={closeModal}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createUserMutation.isPending}>
                  {createUserMutation.isPending ? 'Saving...' : 'Add User'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
