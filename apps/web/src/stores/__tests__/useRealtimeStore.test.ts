import { beforeEach, describe, expect, test } from 'vitest';

import { useRealtimeStore } from '../useRealtimeStore';

const makeNotification = (id: string, read = false) => ({
  id,
  title: `Notification ${id}`,
  message: `Message for ${id}`,
  read,
  createdAt: new Date('2026-08-03T10:00:00.000Z'),
});

beforeEach(() => {
  useRealtimeStore.getState().reset();
});

describe('useRealtimeStore — addNotification badge counting', () => {
  test('an unread notification increments the unread count and is prepended to the list', () => {
    const { addNotification } = useRealtimeStore.getState();
    addNotification(makeNotification('n1'));
    addNotification(makeNotification('n2'));

    const state = useRealtimeStore.getState();
    expect(state.unreadCount).toBe(2);
    expect(state.notifications.map((n) => n.id)).toEqual(['n2', 'n1']);
  });

  test('a notification arriving already read does NOT inflate the badge', () => {
    const { addNotification } = useRealtimeStore.getState();
    addNotification(makeNotification('n1')); // unread -> count 1
    addNotification(makeNotification('n2', true)); // regression: read payload

    const state = useRealtimeStore.getState();
    expect(state.unreadCount).toBe(1);
    expect(state.notifications).toHaveLength(2);
  });

  test('stays in sync when already-read and unread payloads are mixed with markAsRead', () => {
    const { addNotification, markAsRead } = useRealtimeStore.getState();
    addNotification(makeNotification('n1'));
    addNotification(makeNotification('n2', true));
    addNotification(makeNotification('n3'));

    markAsRead('n1');

    const state = useRealtimeStore.getState();
    const actualUnread = state.notifications.filter((n) => !n.read).length;
    expect(state.unreadCount).toBe(actualUnread); // 1
    expect(state.unreadCount).toBe(1);
  });
});

describe('useRealtimeStore — markAsRead badge counting', () => {
  test('marks an unread notification as read and decrements the count by exactly one', () => {
    const { addNotification, markAsRead } = useRealtimeStore.getState();
    addNotification(makeNotification('n1'));
    addNotification(makeNotification('n2'));

    markAsRead('n1');

    const state = useRealtimeStore.getState();
    expect(state.notifications.find((n) => n.id === 'n1')?.read).toBe(true);
    expect(state.notifications.find((n) => n.id === 'n2')?.read).toBe(false);
    expect(state.unreadCount).toBe(1);
  });

  test('is a no-op when the notification is already read (badge cannot undercount)', () => {
    const { addNotification, markAsRead } = useRealtimeStore.getState();
    addNotification(makeNotification('n1'));
    addNotification(makeNotification('n2'));
    addNotification(makeNotification('n3'));

    markAsRead('n1'); // n1 now read, count = 2
    markAsRead('n1'); // regression: clicking it again must NOT drop the count to 1

    const state = useRealtimeStore.getState();
    expect(state.unreadCount).toBe(2);
  });

  test('is a no-op for an unknown notification id', () => {
    const { addNotification, markAsRead } = useRealtimeStore.getState();
    addNotification(makeNotification('n1'));

    markAsRead('does-not-exist');

    expect(useRealtimeStore.getState().unreadCount).toBe(1);
  });

  test('marking every notification read ("Mark all as read") drives the count to exactly zero', () => {
    const { addNotification, markAsRead } = useRealtimeStore.getState();
    addNotification(makeNotification('n1'));
    addNotification(makeNotification('n2'));

    // Mirrors NotificationBell: notifications.forEach((n) => markAsRead(n.id))
    useRealtimeStore.getState().notifications.forEach((n) => markAsRead(n.id));

    const state = useRealtimeStore.getState();
    expect(state.notifications.every((n) => n.read)).toBe(true);
    expect(state.unreadCount).toBe(0);
  });

  test('unread count never drifts out of sync with the notifications list', () => {
    const { addNotification, markAsRead } = useRealtimeStore.getState();
    addNotification(makeNotification('n1'));
    addNotification(makeNotification('n2'));
    addNotification(makeNotification('n3'));

    markAsRead('n2');
    markAsRead('n2'); // duplicate
    markAsRead('ghost'); // unknown

    const state = useRealtimeStore.getState();
    const actualUnread = state.notifications.filter((n) => !n.read).length;
    expect(state.unreadCount).toBe(actualUnread);
  });
});

describe('useRealtimeStore — hydrateNotifications (server ledger merge)', () => {
  test('adopts the server list on an empty store and derives unread count from read flags', () => {
    const { hydrateNotifications } = useRealtimeStore.getState();

    hydrateNotifications([
      makeNotification('s1', false),
      makeNotification('s2', true),
      makeNotification('s3', false),
    ]);

    const state = useRealtimeStore.getState();
    expect(state.notifications.map((n) => n.id)).toHaveLength(3);
    expect(state.unreadCount).toBe(2); // recomputed, never incremented
  });

  test('keeps un-persisted live socket notifications, de-dupes by id, and sorts newest-first', () => {
    const { addNotification, hydrateNotifications } = useRealtimeStore.getState();

    // A live arrival from before hydration succeeds…
    addNotification({
      ...makeNotification('live-1'),
      createdAt: new Date('2026-08-03T12:00:00.000Z'), // newest
    });

    hydrateNotifications([
      { ...makeNotification('live-1', true), createdAt: new Date('2026-08-03T12:00:00.000Z') }, // dup by id
      { ...makeNotification('s-old'), createdAt: new Date('2026-08-03T08:00:00.000Z') },
    ]);

    const state = useRealtimeStore.getState();
    expect(state.notifications.map((n) => n.id)).toEqual(['live-1', 's-old']);
    // The server ledger wins on id collision: live-1 arrives from the server
    // as read=true, leaving only s-old (unread) in the count.
    expect(state.unreadCount).toBe(1);
  });
});
