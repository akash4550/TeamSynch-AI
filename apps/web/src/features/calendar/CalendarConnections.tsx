import { useContext, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { Link2, Unlink, X } from 'lucide-react';

import { api } from '../../lib/api';
import { AuthContext } from '../../providers/AuthProvider';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';

/*
 * FEATURE (ledger #3, 2026-08-05 — real calendar OAuth): connect/
 * disconnect surface for external calendars. Every state is the server's
 * truth: the OAuth redirect lands back on /calendar with oauth=connected
 * | oauth=error&reason=..., a provider without deployment credentials
 * answers 503 from /connect (shown verbatim), and account rows come from
 * GET /calendar/accounts with token material never touching the client.
 *
 * UI PASS (#UI-calendar, 2026-08-07): nit-pass only — section label becomes
 * a real h2, connect buttons move to the compact sm size, dismiss +
 * disconnect controls gain focus rings, the amber action notice gains a
 * border pair for both themes, and the sync timestamp goes tabular-nums.
 * No behavioral change: OAuth redirect params, connect/disconnect flows,
 * busy-state handling, and all copies ("External calendars", "Connect
 * Google/Outlook", "Redirecting…", "Disconnect", "Checking connected
 * accounts…", empty-state sentences, banner text) are verbatim.
 */

interface ConnectedAccount {
  id: string;
  provider: 'GOOGLE' | 'OUTLOOK';
  email: string;
  scopes: string | null;
  accessTokenExpiresAt: string;
  lastSyncedAt: string | null;
  createdAt: string;
}

const PROVIDER_LABEL: Record<string, string> = {
  GOOGLE: 'Google Calendar',
  OUTLOOK: 'Microsoft Outlook',
};

export const CalendarConnections = () => {
  // Optional read (ledger #3 fix): render provider-less harnesses degrade
  // to read-only instead of throwing in useAuth's guard.
  const role = useContext(AuthContext)?.user?.role;
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const canManage = role === 'SUPER_ADMIN';

  const {
    data: accounts,
    isLoading,
  } = useQuery({
    queryKey: ['calendar', 'accounts'],
    queryFn: async () => {
      const res = await api.get('/calendar/accounts');
      return res.data.data as ConnectedAccount[];
    },
  });

  const oauth = searchParams.get('oauth');
  const oauthReason = searchParams.get('reason');
  const oauthEmail = searchParams.get('email');
  const oauthProvider = searchParams.get('provider');

  const dismissOAuthNotice = () => {
    const next = new URLSearchParams(searchParams);
    ['oauth', 'reason', 'email', 'provider'].forEach((k) => next.delete(k));
    setSearchParams(next, { replace: true });
  };

  const connect = async (provider: 'GOOGLE' | 'OUTLOOK') => {
    setBusy(provider);
    setActionMessage(null);
    try {
      const res = await api.get(`/calendar/connect?provider=${provider}`);
      const authUrl = res.data?.data?.authUrl;
      if (typeof authUrl !== 'string' || authUrl.length === 0) {
        setActionMessage('The server did not return an authorization URL.');
        return;
      }
      window.location.href = authUrl;
    } catch (error: any) {
      // FEATURE (ledger #3): 503 = provider not configured on this
      // deployment — show it verbatim instead of a dead button.
      setActionMessage(
        error?.response?.data?.error?.message ??
          'Could not start the calendar connection. Please try again.'
      );
      setBusy(null);
    }
    // On success the browser navigates away; busy state intentionally stays.
  };

  const disconnect = async (provider: 'GOOGLE' | 'OUTLOOK') => {
    setBusy(provider);
    setActionMessage(null);
    try {
      await api.delete(`/calendar/accounts/${provider}`);
      await queryClient.invalidateQueries({ queryKey: ['calendar', 'accounts'] });
    } catch (error: any) {
      setActionMessage(
        error?.response?.data?.error?.message ??
          'Could not disconnect this calendar. Please try again.'
      );
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card className="p-4 space-y-3">
      {oauth === 'connected' && (
        <div className="flex items-start justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-900/20 dark:text-emerald-300" role="status">
          <span>
            Connected <strong>{PROVIDER_LABEL[oauthProvider ?? ''] ?? 'calendar'}</strong>
            {oauthEmail ? <> as <strong>{oauthEmail}</strong></> : null}. The initial
            two-way sync is queued in the background.
          </span>
          <button onClick={dismissOAuthNotice} aria-label="Dismiss" className="shrink-0 rounded opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-emerald-600/40">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}

      {oauth === 'error' && (
        <div className="flex items-start justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-300" role="alert">
          <span>
            Calendar connection failed{oauthReason ? <>: <strong>{oauthReason}</strong></> : '.'}
          </span>
          <button onClick={dismissOAuthNotice} aria-label="Dismiss" className="shrink-0 rounded opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-red-600/40">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
          External calendars
        </h2>

        {canManage && (
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={busy !== null}
              onClick={() => connect('GOOGLE')}
            >
              <Link2 className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
              {busy === 'GOOGLE' ? 'Redirecting…' : 'Connect Google'}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={busy !== null}
              onClick={() => connect('OUTLOOK')}
            >
              <Link2 className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
              {busy === 'OUTLOOK' ? 'Redirecting…' : 'Connect Outlook'}
            </Button>
          </div>
        )}
      </div>

      {actionMessage && (
        <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-300">
          {actionMessage}
        </p>
      )}

      {isLoading ? (
        <p className="text-xs text-gray-500 dark:text-gray-400">Checking connected accounts…</p>
      ) : !accounts || accounts.length === 0 ? (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          No external calendars connected.
          {canManage
            ? ' Connect one above to sync deadlines two-way.'
            : ' Ask a workspace admin to connect one for deadline sync.'}
        </p>
      ) : (
        <ul className="divide-y divide-gray-100 dark:divide-slate-700">
          {accounts.map((account) => (
            <li key={account.id} className="flex items-center justify-between py-2 text-sm">
              <div>
                <span className="font-medium text-gray-900 dark:text-white">
                  {PROVIDER_LABEL[account.provider]}
                </span>
                <span className="ml-2 text-gray-500 dark:text-gray-400">{account.email}</span>
                {account.lastSyncedAt && (
                  <span className="ml-2 text-xs tabular-nums text-gray-400 dark:text-gray-500">
                    last synced {new Date(account.lastSyncedAt).toLocaleString()}
                  </span>
                )}
              </div>
              {canManage && (
                <button
                  onClick={() => disconnect(account.provider)}
                  disabled={busy !== null}
                  className="inline-flex items-center gap-1 rounded text-xs text-red-600 transition-colors hover:text-red-700 focus:outline-none focus:ring-2 focus:ring-red-500/40 disabled:opacity-50 dark:text-red-400 dark:hover:text-red-300"
                >
                  <Unlink className="h-3.5 w-3.5" aria-hidden="true" />
                  Disconnect
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
};
