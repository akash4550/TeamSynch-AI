import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { io, Socket } from 'socket.io-client';
import { useRealtimeStore } from '../stores/useRealtimeStore';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from './AuthProvider';

interface SocketContextType {
  socket: Socket | null;
}

const SocketContext = createContext<SocketContextType>({ socket: null });

export const useSocket = () => useContext(SocketContext);

export const SocketProvider = ({ children }: { children: ReactNode }) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const { setConnected, addNotification, updatePresence, setPresenceSnapshot } = useRealtimeStore();
  const queryClient = useQueryClient();
  const { status, accessToken, refreshSession, clearSession } = useAuth();

  /*
   * BUG FIX (realtime silently dying): the socket was created with
   * `reconnection: false` and a STATIC `auth` object captured at mount, so any
   * transient disconnect (network blip, server redeploy, laptop sleep) killed
   * notifications / live task invalidation / presence until a full page reload,
   * with no user-facing warning.
   *
   * Fix: re-enable reconnection with capped exponential backoff, and hand
   * socket.io an `auth(cb)` FUNCTION — it invokes this on every (re)connect,
   * so retries always authenticate with the freshest in-memory token (the ref
   * is synced before the connect effect below runs), never a stale one and
   * never anything from localStorage.
   */
  const accessTokenRef = useRef(accessToken);
  useEffect(() => {
    accessTokenRef.current = accessToken;
  }, [accessToken]);

  useEffect(() => {
    if (status !== 'authenticated' || !accessToken) {
      setSocket(null);
      setConnected(false);
      return;
    }

    const socketUrl = import.meta.env.VITE_SOCKET_URL?.trim() || undefined;
    const socketInstance = io(socketUrl, {
      path: import.meta.env.VITE_SOCKET_PATH || '/socket.io',
      auth: (cb) => cb({ token: accessTokenRef.current }),
      autoConnect: true,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
      randomizationFactor: 0.5,
    });

    setSocket(socketInstance);

    socketInstance.on('connect', () => {
      setConnected(true);
    });

    socketInstance.on('disconnect', () => {
      setConnected(false);
    });

    /*
     * BUG FIX (#75 — realtime dies permanently at token expiry on idle
     * tabs): the API force-disconnects every socket when its handshake
     * token expires (`expirationTimer` in socket.ts), and this client only
     * ever refreshed tokens reactively on an HTTP 401. With no HTTP
     * traffic (idle-but-open dashboard), every socket.io retry
     * re-presented the stale token captured in accessTokenRef, the server
     * kept rejecting the handshake with 'Authentication error'
     * (AUTHENTICATION_ERROR in socket.ts), and notifications / task
     * invalidation / presence stayed dead — the user even showed offline
     * to colleagues — until they happened to click something that hit the
     * API. On an auth rejection we now run the same deduped refreshSession
     * the axios 401 interceptor uses and re-sync the ref from its RESOLVED
     * token (not the state-sync effect, which flushes after this handler),
     * so the very next retry handshakes fresh. Non-auth errors (network
     * blips) never trigger refresh; a failed refresh clears the session
     * exactly like the interceptor does, flipping status to
     * unauthenticated so this effect's cleanup tears the socket down — no
     * retry loop.
     */
    socketInstance.on('connect_error', (error: Error | undefined) => {
      setConnected(false);
      if (error?.message !== 'Authentication error') return;
      refreshSession()
        .then((freshToken) => {
          accessTokenRef.current = freshToken;
        })
        .catch(() => {
          clearSession();
        });
    });

    // --- Domain Events ---
    
    socketInstance.on('presence.status', (payload) => {
      updatePresence(payload);
    });

    /*
     * FEATURE (queued item #11 — presence roster snapshot-on-join): the
     * API now emits `presence.snapshot` to the joining socket right after
     * room join completes, so a freshly loaded page starts from the true
     * online roster instead of showing everyone offline until the next
     * delta. The listener is hardened the same way as the other event
     * handlers (#54/#56): malformed payloads are ignored rather than
     * crashing the handler chain or wiping the roster.
     */
    socketInstance.on('presence.snapshot', (payload?: { users?: Parameters<typeof setPresenceSnapshot>[0] }) => {
      if (payload && Array.isArray(payload.users)) {
        setPresenceSnapshot(payload.users);
      }
    });

    socketInstance.on('notification.new', (payload) => {
      addNotification({
        // BUG FIX (#54): deprecated legacy `.substr(2, 9)` → `.substring(2, 11)`
        // — identical 9-char slice after the "0." prefix for every base-36
        // string; `substr` is deprecated (annex-B legacy API).
        id: Math.random().toString(36).substring(2, 11),
        ...payload,
        read: false
      });
    });

    socketInstance.on('task.created', () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    });

    socketInstance.on('task.updated', () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    });

    socketInstance.on('task.assigned', () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    });

    /*
     * BUG FIX (pipeline board went stale across users): the API emits
     * `crm.opportunity.moved` to the organization room whenever an
     * opportunity changes stage (board drag-drop or the dedicated move
     * endpoint), but this provider never listened — other users' boards
     * only refreshed on manual reload. Prefix-invalidate
     * ['crm','opportunities'] so every live consumer (Pipeline Board,
     * Opportunities list, CRM dashboard aggregates) refetches. The stages
     * themselves don't change on a move, so ['crm','pipeline-stages'] is
     * intentionally left untouched.
     */
    socketInstance.on('crm.opportunity.moved', () => {
      queryClient.invalidateQueries({ queryKey: ['crm', 'opportunities'] });
    });

    /*
     * BUG FIX (#56 — billing realtime events had no client listener): the
     * API emits `billing.subscription.updated` (subscription created /
     * updated / deleted webhooks in stripe.service) and
     * `billing.payment_failed` (failed invoice) to the organization room,
     * but this provider never subscribed. Every open tab therefore kept
     * serving the STALE ['billing','subscription'] cache — Subscription
     * Settings showed the previous plan/quota bars, and the org's
     * PAST_DUE / CANCELED status was invisible until a manual reload —
     * while the server's human-readable payment-failure warning was fired
     * into the void, so members discovered it only as a surprise HTTP 402
     * on the next quota-gated action (all four entitlement gates are live
     * since #55). Subscribe to both events: prefix-invalidate ['billing']
     * so useSubscriptionUsage refetches immediately, and raise the
     * payment failure as an in-app notification. The store's Notification
     * shape requires id/title/message/createdAt, so the entry is built
     * explicitly rather than blind-spreading the socket payload (which
     * carries only organizationId/status/message/timestamp). No `link` is
     * attached on purpose: the broadcast reaches every org role, and the
     * billing page (/settings) is SUPER_ADMIN/ADMIN-gated — a deep-link
     * would dead-end at the role guard for everyone else.
     */
    socketInstance.on('billing.subscription.updated', () => {
      queryClient.invalidateQueries({ queryKey: ['billing'] });
    });

    socketInstance.on('billing.payment_failed', (payload?: { message?: string }) => {
      queryClient.invalidateQueries({ queryKey: ['billing'] });
      addNotification({
        id: Math.random().toString(36).substring(2, 11),
        title: 'Payment failed',
        message:
          payload?.message ??
          'A payment for this workspace failed. Please update the payment method in Subscription Settings.',
        read: false,
        createdAt: new Date(),
      });
    });

    return () => {
      socketInstance.disconnect();
      setConnected(false);
    };
  }, [accessToken, status, setConnected, addNotification, updatePresence, setPresenceSnapshot, queryClient, refreshSession, clearSession]);

  return (
    <SocketContext.Provider value={{ socket }}>
      {children}
    </SocketContext.Provider>
  );
};
