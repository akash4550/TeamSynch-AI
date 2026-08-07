import { useEffect, useState } from 'react';
import { useUiStore } from '../../store/uiStore';
import { Menu, Search } from 'lucide-react';
import { ThemeToggle } from './ThemeToggle';
import { NotificationBell } from '../ui/NotificationBell';
import { useLocation } from 'react-router-dom';
import { GlobalSearchOverlay } from '../../features/search/GlobalSearchOverlay';
import { useAuth } from '../../providers/AuthProvider';

export const Topbar = () => {
  // --- Existing state/hooks: untouched ---
  const { toggleSidebar } = useUiStore();
  const location = useLocation();
  const { user, organization } = useAuth();
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  // --- Existing Cmd/Ctrl+K global shortcut: untouched ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsSearchOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Simple breadcrumb generator (existing logic, unchanged)
  const pathnames = location.pathname.split('/').filter(x => x);
  const breadcrumb = pathnames.length > 0 ? pathnames[pathnames.length - 1] : 'Dashboard';
  const userInitials = user
    ? `${user.firstName.charAt(0)}${user.lastName.charAt(0)}`.toUpperCase()
    : '';

  return (
    /* Frosted-glass header; borders/padding adapt per breakpoint */
    <header className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-gray-200 bg-white/90 px-4 backdrop-blur transition-colors sm:px-6 dark:border-slate-700/80 dark:bg-slate-800/90">
      {/* Left cluster: menu toggle + breadcrumb (collapses gracefully on mobile) */}
      <div className="flex min-w-0 items-center gap-2 sm:gap-4">
        <button
          onClick={toggleSidebar}
          aria-label="Toggle navigation menu"
          className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary-500/40 dark:text-gray-400 dark:hover:bg-slate-700 dark:hover:text-gray-200"
        >
          <Menu className="h-5 w-5" />
        </button>

        {/* Breadcrumb — org name hidden below sm, crumb truncates instead of
            overflowing on narrow screens */}
        <div className="hidden min-w-0 items-center text-sm sm:flex">
          <span className="truncate text-gray-500 dark:text-gray-400">{organization?.name}</span>
          <span className="mx-2 text-gray-300 dark:text-gray-600">/</span>
          <span className="truncate font-semibold capitalize text-gray-900 dark:text-white">
            {breadcrumb}
          </span>
        </div>
      </div>

      {/* Right cluster: search, notifications, theme, avatar */}
      <div className="flex items-center gap-1.5 sm:gap-3">
        {/* Global Search Trigger — desktop: full width fake input (existing behavior) */}
        <div
          className="relative hidden cursor-pointer md:flex"
          onClick={() => setIsSearchOpen(true)}
        >
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
          <div className="flex w-64 items-center justify-between rounded-lg border border-gray-200 bg-gray-50 py-2 pl-9 pr-3 text-sm text-gray-400 transition-colors hover:border-gray-300 hover:bg-gray-100 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800">
            <span>Search...</span>
            <kbd className="hidden rounded border border-gray-300 px-1.5 text-[10px] font-semibold text-gray-500 sm:inline-block dark:border-gray-600">
              Cmd K
            </kbd>
          </div>
        </div>

        {/* RESPONSIVE FIX: icon-only search trigger for phones/tablets —
            opens the same GlobalSearchOverlay via the same state */}
        <button
          type="button"
          aria-label="Open search"
          onClick={() => setIsSearchOpen(true)}
          className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-slate-700 dark:hover:text-gray-200 md:hidden"
        >
          <Search className="h-5 w-5" />
        </button>

        <GlobalSearchOverlay isOpen={isSearchOpen} onClose={() => setIsSearchOpen(false)} />

        <NotificationBell />

        <ThemeToggle />

        {/* Avatar — subtle divider separates it from the action icons */}
        <div className="ml-1 border-l border-gray-200 pl-3 dark:border-slate-700">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-primary-500 to-primary-700 text-xs font-bold text-white ring-2 ring-primary-100 dark:ring-primary-900"
            title={user ? `${user.firstName} ${user.lastName}` : undefined}
          >
            {userInitials}
          </div>
        </div>
      </div>
    </header>
  );
};
