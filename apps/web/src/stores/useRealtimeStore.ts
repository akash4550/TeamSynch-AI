import { create } from 'zustand';

interface Notification {
  id: string;
  title: string;
  message: string;
  link?: string;
  read: boolean;
  createdAt: Date;
}

export interface Presence {
  userId: string;
  status: 'online' | 'offline';
  lastSeen?: Date;
}

interface RealtimeState {
  isConnected: boolean;
  notifications: Notification[];
  unreadCount: number;
  onlineUsers: Record<string, Presence>;
  
  setConnected: (status: boolean) => void;
  addNotification: (notification: Notification) => void;
  hydrateNotifications: (serverNotifications: Notification[]) => void;
  markAsRead: (id: string) => void;
  updatePresence: (presence: Presence) => void;
  /*
   * Queued item #11 (presence snapshot-on-join): bulk truth replacement
   * for the roster delivered by the server's `presence.snapshot` event on
   * connect. Replace (not merge) is deliberate — the snapshot is the
   * authoritative roster at join time; per-user deltas arriving
   * afterwards keep it current via updatePresence.
   */
  setPresenceSnapshot: (entries: Presence[]) => void;
  reset: () => void;
}

const initialRealtimeState = {
  isConnected: false,
  notifications: [],
  unreadCount: 0,
  onlineUsers: {},
};

export const useRealtimeStore = create<RealtimeState>((set) => ({
  ...initialRealtimeState,

  setConnected: (status) => set({ isConnected: status }),
  
  // Badge-count fix: respect the notification's own `read` flag. Previously the
  // counter incremented unconditionally, so a payload arriving with `read: true`
  // still inflated the bell badge.
  addNotification: (notification) => set((state) => ({
    notifications: [notification, ...state.notifications],
    unreadCount: notification.read ? state.unreadCount : state.unreadCount + 1
  })),

  /*
   * Hydration merge (GET /notifications on app load): adopt the persisted
   * ledger while keeping any live socket notifications that are not on the
   * server yet (matched by id), then re-derive the unread count from the
   * merged set — never by incrementing — so the badge can't drift during
   * hydration. Merged list is sorted newest-first (the server returns desc,
   * but live arrivals carry client-issued dates).
   */
  hydrateNotifications: (serverNotifications) => set((state) => {
    const serverIds = new Set(serverNotifications.map((n) => n.id));
    const liveOnly = state.notifications.filter((n) => !serverIds.has(n.id));
    const merged = [...liveOnly, ...serverNotifications].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    return {
      notifications: merged,
      unreadCount: merged.filter((n) => !n.read).length,
    };
  }),

  // Badge-count fix: only decrement when the notification actually exists AND
  // was still unread. Previously every call decremented the counter (even for
  // already-read or unknown ids), so the bell badge could drift below the true
  // number of unread notifications.
  markAsRead: (id) => set((state) => {
    const target = state.notifications.find(n => n.id === id);
    if (!target || target.read) {
      return {}; // no-op: nothing new was read, so the count must not move
    }

    return {
      notifications: state.notifications.map(n => n.id === id ? { ...n, read: true } : n),
      unreadCount: Math.max(0, state.unreadCount - 1)
    };
  }),

  updatePresence: (presence) => set((state) => ({
    onlineUsers: {
      ...state.onlineUsers,
      [presence.userId]: presence
    }
  })),

  // Queued item #11: replace-with-snapshot semantics — see interface note.
  setPresenceSnapshot: (entries) => set(() => ({
    onlineUsers: Object.fromEntries(entries.map((entry) => [entry.userId, entry])),
  })),

  reset: () => set(initialRealtimeState),
}));
