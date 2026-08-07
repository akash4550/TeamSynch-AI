import { useEffect, useRef, useState } from 'react';
import { Bell } from 'lucide-react';
import { useRealtimeStore } from '../../stores/useRealtimeStore';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';

interface ServerNotification {
  id: string;
  title: string;
  message: string;
  link?: string;
  read: boolean;
  createdAt: string;
}

export const NotificationBell = () => {
  // --- Existing state/handlers: untouched ---
  const [isOpen, setIsOpen] = useState(false);
  const { notifications, unreadCount, markAsRead, hydrateNotifications } = useRealtimeStore();
  const navigate = useNavigate();

  // Wrapper ref used by the outside-press detector below
  const containerRef = useRef<HTMLDivElement>(null);

  /*
   * BUG FIX (bell forgot everything on reload): notifications used to be
   * purely session-scoped socket events even though the server keeps a
   * per-user notification ledger (GET /notifications, mark-read endpoints).
   * Hydrate the store once on mount — the store's merge keeps any live
   * arrivals that predate the response — and sync read-state back to the
   * ledger so the badge and history survive a refresh. Legacy session rows
   * with client-generated ids are tolerated: their remote mark-read simply
   * 400s and is swallowed (local state is already correct).
   */
  useEffect(() => {
    let cancelled = false;

    api
      .get<{ data: ServerNotification[] }>('/notifications')
      .then((res) => {
        if (!cancelled && Array.isArray(res.data?.data)) {
          hydrateNotifications(
            res.data.data.map((n) => ({ ...n, createdAt: new Date(n.createdAt) }))
          );
        }
      })
      .catch(() => {
        /* ledger unavailable — remain purely session-scoped */
      });

    return () => {
      cancelled = true;
    };
  }, [hydrateNotifications]);

  const markAllAsRead = () => {
    notifications.forEach((n) => markAsRead(n.id));
    api.patch('/notifications/read-all').catch(() => {
      /* local state already updated */
    });
  };

  const handleNotificationClick = (id: string, link?: string) => {
    markAsRead(id);
    api.patch(`/notifications/${id}/read`).catch(() => {
      /* local state already updated; ephemeral ids can't persist */
    });
    if (link) {
      navigate(link);
    }
    setIsOpen(false);
  };

  /*
   * Bug fix: the dropdown previously stayed open until the bell was re-clicked
   * or a notification was chosen. Now it dismisses on ANY press outside the
   * component (pointerdown covers mouse + touch + pen) and on Escape.
   * The listener is only attached while the dropdown is open, and it is
   * registered in an effect — i.e. AFTER the press that opened it — so the
   * opening click can never immediately re-close the panel.
   */
  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        aria-label="Notifications"
        aria-expanded={isOpen}
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 rounded-full hover:bg-gray-100 dark:hover:bg-slate-800"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-gray-200 dark:border-slate-700 z-50">
          <div className="p-4 border-b border-gray-100 dark:border-slate-700 flex justify-between items-center">
            <h3 className="font-semibold text-gray-900 dark:text-white">Notifications</h3>
            {unreadCount > 0 && (
              <button
                className="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400"
                onClick={markAllAsRead}
              >
                Mark all as read
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="p-4 text-center text-sm text-gray-500">
                No notifications
              </div>
            ) : (
              <div className="divide-y divide-gray-100 dark:divide-slate-700">
                {notifications.map((notification) => (
                  <div
                    key={notification.id}
                    onClick={() => handleNotificationClick(notification.id, notification.link)}
                    className={`p-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors ${
                      !notification.read ? 'bg-blue-50/50 dark:bg-blue-900/10' : ''
                    }`}
                  >
                    <div className="flex gap-3">
                      {!notification.read && (
                        <div className="w-2 h-2 mt-1.5 rounded-full bg-blue-500 shrink-0" />
                      )}
                      <div>
                        <p className={`text-sm ${!notification.read ? 'font-semibold text-gray-900 dark:text-white' : 'text-gray-700 dark:text-gray-300'}`}>
                          {notification.title}
                        </p>
                        <p className="text-sm text-gray-500 mt-1 line-clamp-2">
                          {notification.message}
                        </p>
                        <p className="text-xs text-gray-400 mt-2">
                          {new Date(notification.createdAt).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
