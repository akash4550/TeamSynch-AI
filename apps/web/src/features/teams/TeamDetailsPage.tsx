import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { Users, Mail, Settings, Plus, X } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { useAuth } from '../../providers/AuthProvider';

/*
 * UI PASS (#UI-team-details, 2026-08-08): visual/a11y alignment to the
 * cluster standard. This page is HEAVILY pinned
 * (teams/__tests__/TeamDetailsPage.test.tsx — read-failure surfaces,
 * invite modal, role editing, delete flow), so every behavioural
 * contract below is untouched by design:
 *  - Tabs stay REAL <button>s (tests query getByRole('button', {name:
 *    /Members \(—\)/}) — converting to a WAI tablist would break them).
 *    aria-pressed + focus rings are additive only; tab text nodes are
 *    byte-identical, incl. '—'-vs-'0' Bug #33 rule.
 *  - Exactly ONE combobox exists on this page (the role <select>) — the
 *    suite's getByRole('combobox') requires it. No new selects added.
 *  - All modal headings, button names, placeholders, and the
 *    'type the team name to confirm' label wiring are verbatim.
 *  - Queries, mutations, payloads, invalidations, 404 split, OWNER
 *    disable rule, and the exact-name delete gate are verbatim.
 *
 * Visual/a11y-only: cluster table chrome (header band, uppercase th,
 * tabular dates, in-card horizontal scroll), ring pills for roles/status,
 * primary-* accent replacing literal blue-*, dialog semantics +
 * backdrop-blur + backdrop-click + ESC on all three modals, labelled
 * fields, role="alert" inline form errors, and 'Loading...' as a real
 * status block.
 */

const fieldClass =
  'h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/40 dark:border-slate-600 dark:bg-slate-700 dark:text-gray-100 dark:placeholder:text-gray-500';

const labelClass = 'mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300';

const thClass =
  'px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400';

const errorBoxClass =
  'rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-400';

export const TeamDetailsPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'members' | 'invitations' | 'settings'>('members');
  const { user } = useAuth();

  const canManageTeams =
    user?.role === 'SUPER_ADMIN' ||
    user?.role === 'ADMIN';

  const {
    data: teamData,
    isLoading: teamLoading,
    isError: teamIsError,
    error: teamError,
    refetch: refetchTeam,
  } = useQuery({
    queryKey: ['team', id],
    queryFn: async () => {
      const res = await api.get(`/teams/${id}`);
      return res.data.data;
    },
  });

  const {
    data: membersData,
    isError: membersIsError,
    error: membersError,
    refetch: refetchMembers,
  } = useQuery({
    queryKey: ['team-members', id],
    queryFn: async () => {
      const res = await api.get(`/teams/${id}/members`);
      return res.data.data;
    },
  });

  const {
    data: invitationsData,
    isError: invitationsIsError,
    error: invitationsError,
    refetch: refetchInvitations,
  } = useQuery({
    queryKey: ['team-invitations', id],
    queryFn: async () => {
      const res = await api.get(`/teams/${id}/invitations`);
      return res.data.data;
    },
    enabled: Boolean(id) && canManageTeams,
  });

  // Shared `{ error: { message } }` envelope extraction (string-only) for the
  // three read-side failure surfaces below (Bug #33).
  const teamErrorMessage = (() => {
    const m = (teamError as any)?.response?.data?.error?.message;
    return typeof m === 'string' && m.length > 0 ? m : null;
  })();
  const membersErrorMessage = (() => {
    const m = (membersError as any)?.response?.data?.error?.message;
    return typeof m === 'string' && m.length > 0 ? m : null;
  })();
  const invitationsErrorMessage = (() => {
    const m = (invitationsError as any)?.response?.data?.error?.message;
    return typeof m === 'string' && m.length > 0 ? m : null;
  })();

  /*
   * BUG FIX ("Invite Member" button was dead): the header CTA rendered with
   * no onClick and the page had no invite mutation at all — admins clicked
   * it and literally nothing happened, even though the server exposes
   * POST /teams/:id/invitations (body `{ email }`, 201 `{ success, data }`).
   * Wire the button to a modal that posts the invite, refreshes the
   * Invitations tab, and surfaces API errors (duplicate email, quota, etc.)
   * instead of failing silently.
   */
  const queryClient = useQueryClient();
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteError, setInviteError] = useState<string | null>(null);

  const inviteMutation = useMutation({
    mutationFn: async (email: string) => {
      const res = await api.post(`/teams/${id}/invitations`, { email });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-invitations', id] });
      setIsInviteOpen(false);
      setInviteEmail('');
      setInviteError(null);
    },
    onError: (error: any) => {
      /*
       * BUG FIX (React crash on failed invites): the API error envelope is
       * `{ success: false, error: { message } }` — see
       * apps/api/src/core/middlewares/errorMiddleware.ts. The previous code
       * stored `response.data.error` (an OBJECT) in `inviteError`, and
       * rendering `{inviteError}` then threw "Objects are not valid as a
       * React child", unmounting the entire page whenever an invite failed
       * (duplicate email, already-a-member, validation error...). Extract
       * the nested `.message`, accept only strings, and fall back to a safe
       * default so the modal always renders plain text.
       */
      const apiMessage = error?.response?.data?.error?.message;
      setInviteError(
        typeof apiMessage === 'string' && apiMessage.length > 0
          ? apiMessage
          : 'Failed to send the invitation. Please check the email and try again.'
      );
    },
  });

  const handleInvite = (e: React.FormEvent) => {
    e.preventDefault();
    const email = inviteEmail.trim();
    if (!email || inviteMutation.isPending) return;
    setInviteError(null);
    inviteMutation.mutate(email);
  };

  /*
   * BUG FIX ("Edit Role" button was dead): the Members tab rendered an
   * "Edit Role" button per row with no onClick and the page had no
   * role-change mutation at all — admins clicked it and nothing happened,
   * even though the server exposes PATCH /teams/:id/members/:userId
   * (body `{ role }`, 200 `{ success, data }`). Wire the button to a modal
   * that patches the member's role and refreshes the Members tab.
   *
   * Role options exclude OWNER on purpose: the server hard-blocks BOTH
   * changing an owner's role afterwards ('Cannot change owner role') and
   * removing an owner ('Cannot remove team owner'), and this app has no
   * transfer-ownership flow — so offering OWNER here would be an
   * accidental one-way door. OWNER rows get a disabled button instead
   * (the server would 400 those requests anyway).
   */
  const ASSIGNABLE_TEAM_ROLES = ['LEAD', 'MEMBER', 'VIEWER'] as const;

  const [editingRole, setEditingRole] = useState<{
    userId: string;
    name: string;
    currentRole: string;
  } | null>(null);
  const [roleDraft, setRoleDraft] = useState<string>('MEMBER');
  const [roleError, setRoleError] = useState<string | null>(null);

  const updateRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      const res = await api.patch(`/teams/${id}/members/${userId}`, { role });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-members', id] });
      setEditingRole(null);
      setRoleError(null);
    },
    onError: (error: any) => {
      // API error envelope is `{ success: false, error: { message } }` —
      // extract the nested string only (see Bug #20 fix above).
      const apiMessage = error?.response?.data?.error?.message;
      setRoleError(
        typeof apiMessage === 'string' && apiMessage.length > 0
          ? apiMessage
          : 'Failed to update the member role. Please try again.'
      );
    },
  });

  const openRoleEditor = (membership: any) => {
    setEditingRole({
      userId: membership.user.id,
      name: `${membership.user.firstName} ${membership.user.lastName}`,
      currentRole: membership.role,
    });
    setRoleDraft(membership.role);
    setRoleError(null);
  };

  const closeRoleEditor = () => {
    setEditingRole(null);
    setRoleError(null);
  };

  const handleRoleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRole || updateRoleMutation.isPending) return;
    if (roleDraft === editingRole.currentRole) return; // nothing to change
    setRoleError(null);
    updateRoleMutation.mutate({ userId: editingRole.userId, role: roleDraft });
  };

  /*
   * BUG FIX ("Delete Team" button was dead): the Settings tab danger zone
   * rendered a "Delete Team" button with no onClick and no delete mutation
   * at all — admins clicked it and nothing happened, even though the
   * server exposes DELETE /teams/:id (soft delete, 200 `{ success, message }`).
   * Because deletion is destructive, the button now opens a type-to-confirm
   * dialog (exact team name required) and only then issues the DELETE;
   * on success the teams list cache is invalidated and we navigate back to
   * /teams (the deleted team's details page no longer has data to show).
   */
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const deleteTeamMutation = useMutation({
    mutationFn: async () => {
      const res = await api.delete(`/teams/${id}`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      setIsDeleteOpen(false);
      setDeleteConfirmText('');
      setDeleteError(null);
      navigate('/teams');
    },
    onError: (error: any) => {
      // API error envelope is `{ success: false, error: { message } }` —
      // extract the nested string only (see Bug #20 fix above).
      const apiMessage = error?.response?.data?.error?.message;
      setDeleteError(
        typeof apiMessage === 'string' && apiMessage.length > 0
          ? apiMessage
          : 'Failed to delete the team. Please try again.'
      );
    },
  });

  const openDeleteDialog = () => {
    setIsDeleteOpen(true);
    setDeleteConfirmText('');
    setDeleteError(null);
  };

  const closeDeleteDialog = () => {
    setIsDeleteOpen(false);
    setDeleteConfirmText('');
    setDeleteError(null);
  };

  // Require an exact team-name match before the DELETE can be issued —
  // this is a destructive, irreversible action.
  const isDeleteConfirmed =
    Boolean(teamData?.name) && deleteConfirmText.trim() === teamData.name;

  const handleDeleteTeam = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isDeleteConfirmed || deleteTeamMutation.isPending) return;
    setDeleteError(null);
    deleteTeamMutation.mutate();
  };

  /* ESC closes whichever dialog is open (parity with the list-page modals
   * — additive dismissal only; never submits or mutates). */
  useEffect(() => {
    const anyOpen = isInviteOpen || editingRole !== null || isDeleteOpen;
    if (!anyOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (isDeleteOpen) closeDeleteDialog();
      else if (editingRole) closeRoleEditor();
      else {
        setIsInviteOpen(false);
        setInviteError(null);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  });

  if (teamLoading) {
    return (
      <div role="status" className="flex items-center justify-center gap-2 py-24 text-sm text-gray-500 dark:text-gray-400">
        <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
        Loading...
      </div>
    );
  }

  /*
   * BUG FIX (blank shell / fabricated page on failed team read — Bug #33):
   * this page previously gated ONLY on `teamLoading`, so a rejected
   * GET /teams/:id (500, network down, expired 401) rendered a blank shell —
   * an empty avatar, an empty heading, "No description", and "Members (0)" —
   * with no error and no way out; and a 404 (deleted team, stale deep-link)
   * showed the same shell instead of "not found". We now render dedicated
   * full-page failure surfaces BEFORE the shell: a neutral "Team not found"
   * panel (with Back to Teams) for 404s, and an honest error panel (server
   * message + Retry) for everything else.
   */
  if (teamIsError) {
    if ((teamError as any)?.response?.status === 404) {
      return (
        <div
          role="alert"
          className="flex flex-col items-center justify-center rounded-lg border border-gray-200 bg-white py-24 text-center dark:border-slate-700 dark:bg-slate-800"
        >
          <h1 className="mb-2 text-xl font-semibold text-gray-900 dark:text-white">Team not found</h1>
          <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">
            {teamErrorMessage ?? "This team doesn't exist, or it may have been deleted."}
          </p>
          <Button variant="primary" onClick={() => navigate('/teams')}>
            Back to Teams
          </Button>
        </div>
      );
    }
    return (
      <div
        role="alert"
        className="flex flex-col items-center justify-center rounded-lg border border-red-200 bg-white py-24 text-center dark:border-red-900/50 dark:bg-slate-800"
      >
        <h1 className="mb-2 text-xl font-semibold text-gray-900 dark:text-white">We couldn't load this team</h1>
        <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">
          {teamErrorMessage ?? 'Something went wrong while fetching this team. Your data is safe — please try again.'}
        </p>
        <div className="flex gap-3">
          <Button variant="secondary" onClick={() => navigate('/teams')}>
            Back to Teams
          </Button>
          <Button variant="primary" onClick={() => refetchTeam()}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  const tabClass = (active: boolean) =>
    `whitespace-nowrap pb-4 px-1 border-b-2 font-medium text-sm flex items-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ${
      active
        ? 'border-primary-500 text-primary-600 dark:text-primary-400'
        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
    }`;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 rounded-xl border border-gray-200 bg-white p-6 sm:flex-row sm:items-center sm:justify-between dark:border-slate-700 dark:bg-slate-800">
        <div className="flex items-center gap-4">
            <div
                className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg text-2xl font-bold text-white shadow-sm"
                style={{ backgroundColor: teamData?.color || '#3b82f6' }}
            >
              {teamData?.name.substring(0, 2).toUpperCase()}
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{teamData?.name}</h1>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{teamData?.description || 'No description'}</p>
            </div>
        </div>
        {canManageTeams && (
          <Button variant="primary" className="self-start" onClick={() => setIsInviteOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Invite Member
          </Button>
        )}
      </div>

      {/* Tabs — REAL buttons by contract (see header block); aria-pressed
          is additive, tab text nodes unchanged. */}
      <div className="border-b border-gray-200 dark:border-slate-700">
        <nav className="-mb-px flex space-x-8 overflow-x-auto">
          <button
            type="button"
            aria-pressed={activeTab === 'members'}
            onClick={() => setActiveTab('members')}
            className={tabClass(activeTab === 'members')}
          >
            <Users className="w-4 h-4" aria-hidden="true" />
            {/* Bug #33: never show "(0)" when the read failed — 0 claims the
                team has no members; an em dash honestly says "unknown". */}
            Members ({membersIsError ? '—' : membersData?.length || 0})
          </button>
          {canManageTeams && (
            <button
              type="button"
              aria-pressed={activeTab === 'invitations'}
              onClick={() => setActiveTab('invitations')}
              className={tabClass(activeTab === 'invitations')}
            >
              <Mail className="w-4 h-4" aria-hidden="true" />
              {/* Bug #33: same — "—" while the read has failed, not "(0)". */}
              Invitations ({invitationsIsError ? '—' : invitationsData?.length || 0})
            </button>
          )}
          {canManageTeams && (
            <button
              type="button"
              aria-pressed={activeTab === 'settings'}
              onClick={() => setActiveTab('settings')}
              className={tabClass(activeTab === 'settings')}
            >
              <Settings className="w-4 h-4" aria-hidden="true" />
              Settings
            </button>
          )}
        </nav>
      </div>

      {/* Tab Content — cluster table chrome; in-card horizontal scroll */}
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-800">
        {activeTab === 'members' && (
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50/75 dark:border-slate-700 dark:bg-slate-800/80">
                  <th scope="col" className={thClass}>User</th>
                  <th scope="col" className={thClass}>Role</th>
                  <th scope="col" className={thClass}>Joined Date</th>
                  <th scope="col" className={thClass}>Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-700/70">
                {membersIsError ? (
                  // Bug #33: honest failure row — a failed read used to render
                  // an empty table as if the team had zero members.
                  <tr>
                    <td colSpan={4} className="px-6 py-8">
                      <div
                        role="alert"
                        className="mx-auto max-w-md rounded-lg border border-red-200 bg-red-50 px-4 py-6 text-center dark:border-red-900/50 dark:bg-red-900/20"
                      >
                        <p className="text-sm font-medium text-red-700 dark:text-red-300">We couldn't load this team's members</p>
                        <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                          {membersErrorMessage ?? 'Something went wrong while fetching the members. Your data is safe — please try again.'}
                        </p>
                        <Button size="sm" className="mt-3" onClick={() => refetchMembers()}>
                          Retry
                        </Button>
                      </div>
                    </td>
                  </tr>
                ) : membersData?.map((membership: any) => (
                  <tr key={membership.id} className="hover:bg-gray-50 dark:hover:bg-slate-700/40">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-50 font-bold text-primary-700 dark:bg-primary-400/10 dark:text-primary-300">
                            {membership.user.firstName[0]}
                        </div>
                        <div>
                            <div className="font-medium text-gray-900 dark:text-white">
                                {membership.user.firstName} {membership.user.lastName}
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">{membership.user.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                        <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600 ring-1 ring-inset ring-gray-500/10 dark:bg-slate-700/50 dark:text-gray-300 dark:ring-slate-500/30">
                            {membership.role}
                        </span>
                    </td>
                    <td className="px-6 py-4 tabular-nums text-gray-500 dark:text-gray-400">{new Date(membership.joinedAt).toLocaleDateString()}</td>
                    <td className="px-6 py-4">
                        {canManageTeams && (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={membership.role === 'OWNER'}
                            title={
                              membership.role === 'OWNER'
                                ? "The team owner's role cannot be changed"
                                : "Change this member's role"
                            }
                            onClick={() => openRoleEditor(membership)}
                          >
                            Edit Role
                          </Button>
                        )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
        )}

        {activeTab === 'invitations' && canManageTeams && (
             <table className="w-full min-w-[640px] text-sm">
             <thead>
               <tr className="border-b border-gray-200 bg-gray-50/75 dark:border-slate-700 dark:bg-slate-800/80">
                 <th scope="col" className={thClass}>Email</th>
                 <th scope="col" className={thClass}>Status</th>
                 <th scope="col" className={thClass}>Invited By</th>
                 <th scope="col" className={thClass}>Sent Date</th>
               </tr>
             </thead>
             <tbody className="divide-y divide-gray-100 dark:divide-slate-700/70">
               {invitationsIsError ? (
                 // Bug #33: honest failure row — a failed read used to render
                 // an empty table as if there were no pending invitations.
                 <tr>
                   <td colSpan={4} className="px-6 py-8">
                     <div
                       role="alert"
                       className="mx-auto max-w-md rounded-lg border border-red-200 bg-red-50 px-4 py-6 text-center dark:border-red-900/50 dark:bg-red-900/20"
                     >
                       <p className="text-sm font-medium text-red-700 dark:text-red-300">We couldn't load the invitations</p>
                       <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                         {invitationsErrorMessage ?? 'Something went wrong while fetching the invitations. Your data is safe — please try again.'}
                       </p>
                       <Button size="sm" className="mt-3" onClick={() => refetchInvitations()}>
                         Retry
                       </Button>
                     </div>
                   </td>
                 </tr>
               ) : invitationsData?.length === 0 ? (
                 <tr>
                     <td colSpan={4} className="px-6 py-8 text-center text-gray-500 dark:text-gray-400">No pending invitations</td>
                 </tr>
               ) : invitationsData?.map((invitation: any) => (
                 <tr key={invitation.id} className="hover:bg-gray-50 dark:hover:bg-slate-700/40">
                   <td className="px-6 py-4 text-gray-900 dark:text-gray-100">{invitation.email}</td>
                   <td className="px-6 py-4">
                       <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-600/20 dark:bg-amber-400/10 dark:text-amber-300 dark:ring-amber-400/20">
                           {invitation.status}
                       </span>
                   </td>
                   <td className="px-6 py-4 text-gray-500 dark:text-gray-400">{invitation.invitedBy.firstName}</td>
                   <td className="px-6 py-4 tabular-nums text-gray-500 dark:text-gray-400">{new Date(invitation.createdAt).toLocaleDateString()}</td>
                 </tr>
               ))}
             </tbody>
           </table>
        )}

        {activeTab === 'settings' && canManageTeams && (
            <div className="p-6">
                <h3 className="mb-4 text-lg font-medium text-gray-900 dark:text-white">Danger Zone</h3>
                <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900/50 dark:bg-red-900/10">
                    <h4 className="font-medium text-red-800 dark:text-red-400">Delete Team</h4>
                    <p className="mb-4 mt-1 text-sm text-red-600 dark:text-red-400">
                        Once you delete a team, there is no going back. Please be certain.
                    </p>
                    <Button variant="danger" onClick={openDeleteDialog}>
                        Delete Team
                    </Button>
                </div>
            </div>
        )}
      </div>

      {/* Invite Member Modal */}
      {isInviteOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm"
          onClick={() => {
            setIsInviteOpen(false);
            setInviteError(null);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="invite-member-title"
            className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-slate-800"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 id="invite-member-title" className="text-lg font-semibold text-gray-900 dark:text-white">Invite Team Member</h3>
              <button
                type="button"
                aria-label="Close dialog"
                onClick={() => {
                  setIsInviteOpen(false);
                  setInviteError(null);
                }}
                className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:hover:bg-slate-700 dark:hover:text-gray-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleInvite} className="space-y-4">
              <div>
                <label htmlFor="invite-email" className={labelClass}>Email Address *</label>
                <input
                  id="invite-email"
                  type="email"
                  required
                  autoFocus
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className={fieldClass}
                  placeholder="teammate@company.com"
                />
              </div>
              {inviteError && (
                <p role="alert" className={errorBoxClass}>{inviteError}</p>
              )}
              <div className="flex justify-end gap-2 border-t border-gray-100 pt-4 dark:border-slate-700">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setIsInviteOpen(false);
                    setInviteError(null);
                  }}
                >
                  Cancel
                </Button>
                <Button type="submit" variant="primary" disabled={inviteMutation.isPending}>
                  {inviteMutation.isPending ? 'Sending...' : 'Send Invitation'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Edit Member Role Modal */}
      {editingRole && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm"
          onClick={closeRoleEditor}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-role-title"
            className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-slate-800"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 id="edit-role-title" className="text-lg font-semibold text-gray-900 dark:text-white">Edit Member Role</h3>
              <button
                type="button"
                aria-label="Close dialog"
                onClick={closeRoleEditor}
                className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:hover:bg-slate-700 dark:hover:text-gray-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleRoleSubmit} className="space-y-4">
              <p className="text-sm text-gray-600 dark:text-gray-300">
                Change role for <span className="font-medium text-gray-900 dark:text-white">{editingRole.name}</span>
              </p>
              <div>
                <label htmlFor="team-role-select" className={labelClass}>Role</label>
                {/* The ONLY combobox on this page — pinned by the suite's
                    getByRole('combobox'). Do not add other <select>s here. */}
                <select
                  id="team-role-select"
                  value={roleDraft}
                  onChange={(e) => setRoleDraft(e.target.value)}
                  className={fieldClass}
                >
                  {ASSIGNABLE_TEAM_ROLES.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
              </div>
              {roleError && (
                <p role="alert" className={errorBoxClass}>{roleError}</p>
              )}
              <div className="flex justify-end gap-2 border-t border-gray-100 pt-4 dark:border-slate-700">
                <Button type="button" variant="secondary" onClick={closeRoleEditor}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  disabled={updateRoleMutation.isPending || roleDraft === editingRole.currentRole}
                >
                  {updateRoleMutation.isPending ? 'Saving...' : 'Save Role'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Delete Team — type-to-confirm dialog */}
      {isDeleteOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm"
          onClick={closeDeleteDialog}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-team-title"
            className="w-full max-w-md rounded-2xl border border-red-200 bg-white p-6 shadow-xl dark:border-red-900/50 dark:bg-slate-800"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 id="delete-team-title" className="text-lg font-semibold text-red-700 dark:text-red-400">Delete Team</h3>
              <button
                type="button"
                aria-label="Close dialog"
                onClick={closeDeleteDialog}
                className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:hover:bg-slate-700 dark:hover:text-gray-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleDeleteTeam} className="space-y-4">
              <p className="text-sm text-gray-600 dark:text-gray-300">
                This will permanently delete{' '}
                <span className="font-medium text-gray-900 dark:text-white">{teamData?.name}</span>{' '}
                along with its member associations. This action cannot be undone.
              </p>
              <div>
                <label
                  htmlFor="delete-team-confirm"
                  className={labelClass}
                >
                  Type the team name to confirm
                </label>
                <input
                  id="delete-team-confirm"
                  type="text"
                  autoFocus
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  className={fieldClass}
                  placeholder={teamData?.name}
                />
              </div>
              {deleteError && (
                <p role="alert" className={errorBoxClass}>{deleteError}</p>
              )}
              <div className="flex justify-end gap-2 border-t border-gray-100 pt-4 dark:border-slate-700">
                <Button type="button" variant="secondary" onClick={closeDeleteDialog}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="danger"
                  disabled={!isDeleteConfirmed || deleteTeamMutation.isPending}
                >
                  {deleteTeamMutation.isPending ? 'Deleting...' : 'Delete Permanently'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
