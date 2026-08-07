import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle2, MailWarning, Users } from 'lucide-react';

import { api } from '../../lib/api';

/*
 * UI PASS (#UI-accept-invitation, 2026-08-07): visual-only alignment to the
 * LoginPage auth standard — literal blue-* utilities moved onto the shared
 * primary-* accent, focus rings raised to the cluster standard
 * (ring-2 ring-primary-500[/40] on inputs, full ring-offset ring on
 * buttons/links), the shell card matches the login card's border/shadow,
 * and the error banner gains the bordered treatment. All lifecycle logic,
 * copy, ids, labels, and handlers are byte-identical; lucide icons kept
 * (the auth sibling LoginPage also uses lucide — no icon-system churn).
 */

/*
 * FEATURE (ledger #1, 2026-08-05 — invitation accept lifecycle): public
 * landing page for emailed invitation links
 * (/accept-invitation?token=...). Every state is honest about what the
 * server actually said: inspecting, invalid/forged link, used, expired,
 * superseded by a newer invite, team unavailable — never a generic
 * spinner-then-login-redirect. Existing accounts accept with one click
 * (the token is the email-ownership proof); brand-new invitees set
 * name + password here and then sign in normally.
 */

interface InspectOk {
  valid: true;
  email: string;
  teamName: string;
  organizationName: string;
  expiresAt: string;
  existingUser: boolean;
}

interface InspectInvalid {
  valid: false;
  reason: 'USED' | 'EXPIRED' | 'SUPERSEDED' | 'UNAVAILABLE';
  message: string;
}

type InspectResponse = InspectOk | InspectInvalid;

const REASON_TITLES: Record<string, string> = {
  USED: 'Invitation already used',
  EXPIRED: 'Invitation expired',
  SUPERSEDED: 'A newer invitation exists',
  UNAVAILABLE: 'Team no longer available',
};

export const AcceptInvitationPage = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';

  const [inspectState, setInspectState] = useState<
    | { phase: 'loading' }
    | { phase: 'error'; message: string }
    | { phase: 'ready'; details: InspectResponse }
  >({ phase: 'loading' });

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [password, setPassword] = useState('');
  const [acceptError, setAcceptError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [completedTeam, setCompletedTeam] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const inspect = async () => {
      if (!token) {
        setInspectState({
          phase: 'error',
          message: 'This link is missing its invitation token.',
        });
        return;
      }

      try {
        const { data } = await api.get<{ data: InspectResponse }>(
          `/teams/invitations/${encodeURIComponent(token)}`
        );
        if (!cancelled) {
          setInspectState({ phase: 'ready', details: data.data });
        }
      } catch (error: any) {
        const message =
          error?.response?.data?.error?.message ??
          'This invitation link could not be verified.';
        if (!cancelled) {
          setInspectState({ phase: 'error', message });
        }
      }
    };

    void inspect();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const submit = useCallback(
    async (event?: FormEvent) => {
      event?.preventDefault();
      setAcceptError(null);
      setIsSubmitting(true);

      try {
        const needsAccount =
          inspectState.phase === 'ready' &&
          inspectState.details.valid &&
          !inspectState.details.existingUser;

        const { data } = await api.post<{
          data: { teamName: string };
        }>(
          `/teams/invitations/${encodeURIComponent(token)}/accept`,
          needsAccount
            ? { firstName, lastName, password }
            : {}
        );
        setCompletedTeam(data.data.teamName);
      } catch (error: any) {
        setAcceptError(
          error?.response?.data?.error?.message ??
            'The invitation could not be accepted. Please try again.'
        );
      } finally {
        setIsSubmitting(false);
      }
    },
    [inspectState, token, firstName, lastName, password]
  );

  const shell = (children: React.ReactNode) => (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 dark:bg-slate-900">
      <div className="w-full max-w-md rounded-2xl border border-gray-200/80 bg-white p-8 shadow-[0_8px_30px_rgba(15,23,42,0.08)] dark:border-slate-700/80 dark:bg-slate-800">
        {children}
      </div>
    </div>
  );

  if (inspectState.phase === 'loading') {
    return shell(
      <div className="text-center" role="status">
        <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Verifying your invitation…
        </p>
      </div>
    );
  }

  if (inspectState.phase === 'error') {
    return shell(
      <div className="text-center">
        <MailWarning className="mx-auto mb-3 h-10 w-10 text-amber-500" />
        <h1 className="text-lg font-semibold text-gray-900 dark:text-white">
          This invitation link isn't valid
        </h1>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          {inspectState.message}
        </p>
        <Link
          to="/login"
          className="mt-6 inline-block rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:focus:ring-offset-slate-800"
        >
          Go to sign in
        </Link>
      </div>
    );
  }

  const { details } = inspectState;

  if (!details.valid) {
    return shell(
      <div className="text-center">
        <MailWarning className="mx-auto mb-3 h-10 w-10 text-amber-500" />
        <h1 className="text-lg font-semibold text-gray-900 dark:text-white">
          {REASON_TITLES[details.reason] ?? 'Invitation unavailable'}
        </h1>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          {details.message}
        </p>
        <Link
          to="/login"
          className="mt-6 inline-block rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:focus:ring-offset-slate-800"
        >
          Go to sign in
        </Link>
      </div>
    );
  }

  if (completedTeam) {
    return shell(
      <div className="text-center">
        <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-emerald-500" />
        <h1 className="text-lg font-semibold text-gray-900 dark:text-white">
          Welcome to {completedTeam}
        </h1>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          {details.existingUser
            ? 'You have been added to the team. Sign in to continue.'
            : 'Your account is ready. Sign in with your email and new password to continue.'}
        </p>
        <Link
          to="/login"
          className="mt-6 inline-block rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:focus:ring-offset-slate-800"
        >
          Continue to sign in
        </Link>
      </div>
    );
  }

  const inputClass =
    'mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/40 dark:border-slate-600 dark:bg-slate-900 dark:text-white dark:placeholder:text-gray-500';

  return shell(
    <div>
      <div className="text-center">
        <Users className="mx-auto mb-3 h-10 w-10 text-primary-500" />
        <h1 className="text-lg font-semibold text-gray-900 dark:text-white">
          Join {details.teamName}
        </h1>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          You've been invited to join <strong>{details.teamName}</strong> in{' '}
          <strong>{details.organizationName}</strong> as{' '}
          <strong>{details.email}</strong>.
        </p>
      </div>

      <form onSubmit={submit} className="mt-6 space-y-4">
        {!details.existingUser && (
          <>
            <div>
              <label htmlFor="inv-first" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                First name
              </label>
              <input
                id="inv-first"
                className={inputClass}
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
                maxLength={50}
              />
            </div>
            <div>
              <label htmlFor="inv-last" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Last name
              </label>
              <input
                id="inv-last"
                className={inputClass}
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                required
                maxLength={50}
              />
            </div>
            <div>
              <label htmlFor="inv-pass" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Create a password
              </label>
              <input
                id="inv-pass"
                type="password"
                className={inputClass}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                maxLength={72}
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                At least 8 characters.
              </p>
            </div>
          </>
        )}

        {acceptError && (
          <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
            {acceptError}
          </p>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 disabled:opacity-60 dark:focus:ring-offset-slate-800"
        >
          {isSubmitting
            ? 'Accepting…'
            : details.existingUser
              ? 'Accept invitation'
              : 'Create account & join'}
        </button>
      </form>

      <p className="mt-4 text-center text-xs text-gray-500 dark:text-gray-400">
        Invitation expires {new Date(details.expiresAt).toLocaleDateString()}.
      </p>
    </div>
  );
};
