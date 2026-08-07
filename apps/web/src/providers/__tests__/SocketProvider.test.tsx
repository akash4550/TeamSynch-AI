import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import { io, type Socket } from 'socket.io-client';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { useRealtimeStore } from '../../stores/useRealtimeStore';
import { useAuth } from '../AuthProvider';
import { SocketProvider } from '../SocketProvider';

vi.mock('socket.io-client', () => ({
  io: vi.fn(),
}));

vi.mock('../AuthProvider', () => ({
  useAuth: vi.fn(),
}));

const unauthenticated = (): ReturnType<typeof useAuth> => ({
  status: 'unauthenticated',
  accessToken: null,
  user: null,
  organization: null,
  login: vi.fn(),
  logout: vi.fn(),
  clearSession: vi.fn(),
  // BUG FIX (#75): required by the widened AuthContextValue contract.
  refreshSession: vi.fn().mockResolvedValue('refreshed-access-token'),
});

const renderSocketProvider = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const tree = () => (
    <QueryClientProvider client={queryClient}>
      <SocketProvider>
        <span>Socket child</span>
      </SocketProvider>
    </QueryClientProvider>
  );
  const result = render(tree());
  return { ...result, queryClient, rerenderTree: () => result.rerender(tree()) };
};

const createSocket = () => {
  const handlers = new Map<string, (payload?: unknown) => void>();
  const socket = {
    on: vi.fn((event: string, listener: (payload?: unknown) => void) => {
      handlers.set(event, listener);
      return socket;
    }),
    disconnect: vi.fn(),
  };

  return {
    handlers,
    socket: socket as unknown as Socket,
    disconnect: socket.disconnect,
  };
};

beforeEach(() => {
  vi.resetAllMocks();
  useRealtimeStore.getState().reset();
  vi.mocked(useAuth).mockReturnValue(unauthenticated());
});

describe('SocketProvider authentication boundary', () => {
  test('does not create a socket while the session is unauthenticated', () => {
    window.localStorage.setItem('aiworkspace_token', 'obsolete-mock-token');

    renderSocketProvider();

    expect(screen.getByText('Socket child')).toBeInTheDocument();
    expect(io).not.toHaveBeenCalled();
    expect(useRealtimeStore.getState().isConnected).toBe(false);
  });

  test('connects once with only the canonical in-memory access token', async () => {
    const { socket } = createSocket();
    vi.mocked(io).mockReturnValue(socket);
    window.localStorage.setItem('aiworkspace_token', 'obsolete-storage-token');
    vi.mocked(useAuth).mockReturnValue({
      ...unauthenticated(),
      status: 'authenticated',
      accessToken: 'memory-access-token',
    });

    renderSocketProvider();

    await waitFor(() => expect(io).toHaveBeenCalledTimes(1));
    const url = vi.mocked(io).mock.calls[0]?.[0];
    const options = vi.mocked(io).mock.calls[0]?.[1]!;
    expect(url).toBeUndefined();
    expect(options).toMatchObject({
      path: '/socket.io',
      autoConnect: true,
      reconnection: true,
    });
    // Auth is now a callback (fresh token per (re)connect) — it must still
    // resolve to ONLY the canonical in-memory token, never localStorage.
    expect(typeof options.auth).toBe('function');
    const authCallback = vi.fn();
    (options.auth as (cb: (data: { token: string | null }) => void) => void)(authCallback);
    expect(authCallback).toHaveBeenCalledWith({ token: 'memory-access-token' });
  });

  test('disconnects the current socket and clears connection state when the session ends', async () => {
    const { socket, handlers, disconnect } = createSocket();
    vi.mocked(io).mockReturnValue(socket);
    let authState: ReturnType<typeof useAuth> = {
      ...unauthenticated(),
      status: 'authenticated',
      accessToken: 'memory-access-token',
    };
    vi.mocked(useAuth).mockImplementation(() => authState);
    const { rerenderTree } = renderSocketProvider();
    await waitFor(() => expect(io).toHaveBeenCalledTimes(1));

    act(() => {
      handlers.get('connect')?.();
    });
    expect(useRealtimeStore.getState().isConnected).toBe(true);

    authState = unauthenticated();
    rerenderTree();

    await waitFor(() => expect(disconnect).toHaveBeenCalledTimes(1));
    expect(useRealtimeStore.getState().isConnected).toBe(false);
    expect(io).toHaveBeenCalledTimes(1);
  });

  test('invalidates opportunity queries when the server broadcasts a pipeline move', async () => {
    const { socket, handlers } = createSocket();
    vi.mocked(io).mockReturnValue(socket);
    vi.mocked(useAuth).mockReturnValue({
      ...unauthenticated(),
      status: 'authenticated',
      accessToken: 'memory-access-token',
    });

    const { queryClient } = renderSocketProvider();

    await waitFor(() => expect(io).toHaveBeenCalledTimes(1));
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    act(() => {
      handlers.get('crm.opportunity.moved')?.();
    });

    // Prefix key: must cover the Pipeline Board
    // ['crm','opportunities', {limit:100}], the list page, and dashboard.
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['crm', 'opportunities'],
    });
  });

  /*
   * Bug #56 regression coverage: stripe.service emits
   * `billing.subscription.updated` on every subscription-mutating webhook.
   * Without a client listener, open tabs served the stale
   * ['billing','subscription'] cache until a manual reload.
   */
  test('invalidates billing queries when a subscription update is broadcast', async () => {
    const { socket, handlers } = createSocket();
    vi.mocked(io).mockReturnValue(socket);
    vi.mocked(useAuth).mockReturnValue({
      ...unauthenticated(),
      status: 'authenticated',
      accessToken: 'memory-access-token',
    });

    const { queryClient } = renderSocketProvider();

    await waitFor(() => expect(io).toHaveBeenCalledTimes(1));
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    act(() => {
      handlers.get('billing.subscription.updated')?.();
    });

    // Prefix key must cover useSubscriptionUsage's ['billing','subscription']
    // — the only billing query key in the web app (see useBilling.ts).
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['billing'],
    });
  });

  test('invalidates billing queries and warns in-app when a payment fails', async () => {
    const { socket, handlers } = createSocket();
    vi.mocked(io).mockReturnValue(socket);
    vi.mocked(useAuth).mockReturnValue({
      ...unauthenticated(),
      status: 'authenticated',
      accessToken: 'memory-access-token',
    });

    const { queryClient } = renderSocketProvider();

    await waitFor(() => expect(io).toHaveBeenCalledTimes(1));
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    act(() => {
      handlers.get('billing.payment_failed')?.({
        organizationId: 'org-1',
        status: 'PAST_DUE',
        message: 'Payment failed for current billing period. Please update your payment method.',
        timestamp: '2026-08-04T00:00:00.000Z',
      });
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['billing'] });

    const { notifications, unreadCount } = useRealtimeStore.getState();
    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toMatchObject({
      title: 'Payment failed',
      message: 'Payment failed for current billing period. Please update your payment method.',
      read: false,
    });
    expect(notifications[0].id).toBeTruthy();
    expect(notifications[0].createdAt).toBeInstanceOf(Date);
    expect(unreadCount).toBe(1);
  });

  test('falls back to a generic warning when the payment-failure payload has no message', async () => {
    const { socket, handlers } = createSocket();
    vi.mocked(io).mockReturnValue(socket);
    vi.mocked(useAuth).mockReturnValue({
      ...unauthenticated(),
      status: 'authenticated',
      accessToken: 'memory-access-token',
    });

    renderSocketProvider();

    await waitFor(() => expect(io).toHaveBeenCalledTimes(1));

    // The listener must not crash on an undefined payload nor render
    // "undefined" into the notification centre.
    act(() => {
      handlers.get('billing.payment_failed')?.(undefined);
    });

    const { notifications } = useRealtimeStore.getState();
    expect(notifications).toHaveLength(1);
    expect(notifications[0].title).toBe('Payment failed');
    expect(notifications[0].message).toContain('payment');
    expect(notifications[0].message).not.toContain('undefined');
  });

  /*
   * BUG FIX (#75): the API force-disconnects sockets at access-token
   * expiry; without an HTTP 401 to trigger a refresh, rejected handshake
   * retries looped forever on the stale token. The connect_error handler
   * now runs the deduped refreshSession on auth rejections and re-syncs
   * the token ref from the RESOLVED value.
   */
  test('an auth handshake rejection refreshes the session and re-syncs the token ref for the next reconnect', async () => {
    const { socket, handlers } = createSocket();
    vi.mocked(io).mockReturnValue(socket);
    const refreshSession = vi.fn().mockResolvedValue('fresh-access-token');
    const clearSession = vi.fn();
    vi.mocked(useAuth).mockReturnValue({
      ...unauthenticated(),
      status: 'authenticated',
      accessToken: 'stale-access-token',
      refreshSession,
      clearSession,
    });

    renderSocketProvider();
    await waitFor(() => expect(io).toHaveBeenCalledTimes(1));
    const options = vi.mocked(io).mock.calls[0]?.[1]!;

    // Baseline: before the rejection, handshakes offer the stale token.
    const firstAuth = vi.fn();
    (options.auth as (cb: (d: { token: string | null }) => void) => void)(firstAuth);
    expect(firstAuth).toHaveBeenCalledWith({ token: 'stale-access-token' });

    await act(async () => {
      handlers.get('connect_error')?.(new Error('Authentication error'));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(clearSession).not.toHaveBeenCalled();

    // The NEXT (re)connect attempt must present the freshly refreshed token.
    const secondAuth = vi.fn();
    (options.auth as (cb: (d: { token: string | null }) => void) => void)(secondAuth);
    expect(secondAuth).toHaveBeenCalledWith({ token: 'fresh-access-token' });
  });

  test('a failed refresh after an auth rejection clears the session (mirrors the axios 401 interceptor)', async () => {
    const { socket, handlers } = createSocket();
    vi.mocked(io).mockReturnValue(socket);
    const refreshSession = vi.fn().mockRejectedValue(new Error('refresh token expired'));
    const clearSession = vi.fn();
    vi.mocked(useAuth).mockReturnValue({
      ...unauthenticated(),
      status: 'authenticated',
      accessToken: 'stale-access-token',
      refreshSession,
      clearSession,
    });

    renderSocketProvider();
    await waitFor(() => expect(io).toHaveBeenCalledTimes(1));

    await act(async () => {
      handlers.get('connect_error')?.(new Error('Authentication error'));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(clearSession).toHaveBeenCalledTimes(1);
    expect(useRealtimeStore.getState().isConnected).toBe(false);
  });

  /*
   * FEATURE (queued item #11 — presence snapshot-on-join): a freshly
   * loaded page must start from the true online roster instead of showing
   * everyone offline until the next presence delta arrives.
   */
  test('hydrates the online roster from presence.snapshot and keeps it current with later deltas', async () => {
    const { socket, handlers } = createSocket();
    vi.mocked(io).mockReturnValue(socket);
    vi.mocked(useAuth).mockReturnValue({
      ...unauthenticated(),
      status: 'authenticated',
      accessToken: 'memory-access-token',
    });

    renderSocketProvider();
    await waitFor(() => expect(io).toHaveBeenCalledTimes(1));

    act(() => {
      handlers.get('presence.snapshot')?.({
        users: [
          { userId: 'u_1', status: 'online', lastSeen: new Date() },
          { userId: 'u_2', status: 'online', lastSeen: new Date() },
        ],
        timestamp: new Date(),
      });
    });

    let online = useRealtimeStore.getState().onlineUsers;
    expect(Object.keys(online).sort()).toEqual(['u_1', 'u_2']);
    expect(online['u_1'].status).toBe('online');
    expect(online['u_2'].status).toBe('online');

    // A later per-user delta updates one entry; the rest of the roster stays.
    act(() => {
      handlers.get('presence.status')?.({ userId: 'u_1', status: 'offline', lastSeen: new Date() });
    });

    online = useRealtimeStore.getState().onlineUsers;
    expect(online['u_1'].status).toBe('offline');
    expect(online['u_2'].status).toBe('online');
  });

  test('malformed presence.snapshot payloads are ignored without wiping the roster', async () => {
    const { socket, handlers } = createSocket();
    vi.mocked(io).mockReturnValue(socket);
    vi.mocked(useAuth).mockReturnValue({
      ...unauthenticated(),
      status: 'authenticated',
      accessToken: 'memory-access-token',
    });

    renderSocketProvider();
    await waitFor(() => expect(io).toHaveBeenCalledTimes(1));

    act(() => {
      handlers.get('presence.status')?.({ userId: 'u_known', status: 'online', lastSeen: new Date() });
    });
    expect(useRealtimeStore.getState().onlineUsers['u_known']?.status).toBe('online');

    expect(() =>
      act(() => {
        handlers.get('presence.snapshot')?.(undefined);
        handlers.get('presence.snapshot')?.({});
        handlers.get('presence.snapshot')?.({ users: 'not-an-array' });
      })
    ).not.toThrow();

    expect(useRealtimeStore.getState().onlineUsers['u_known']?.status).toBe('online');
  });

  test('non-auth connect errors never trigger a session refresh', async () => {
    const { socket, handlers } = createSocket();
    vi.mocked(io).mockReturnValue(socket);
    const refreshSession = vi.fn().mockResolvedValue('fresh-access-token');
    const clearSession = vi.fn();
    vi.mocked(useAuth).mockReturnValue({
      ...unauthenticated(),
      status: 'authenticated',
      accessToken: 'memory-access-token',
      refreshSession,
      clearSession,
    });

    renderSocketProvider();
    await waitFor(() => expect(io).toHaveBeenCalledTimes(1));

    await act(async () => {
      handlers.get('connect_error')?.(new Error('xhr poll error'));
      await Promise.resolve();
    });

    expect(refreshSession).not.toHaveBeenCalled();
    expect(clearSession).not.toHaveBeenCalled();
    expect(useRealtimeStore.getState().isConnected).toBe(false);
  });
});
