import { useUiStore } from '../../store/uiStore';
import { navigationConfig } from '../../config/navigation';
import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { LogOut, X } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';

import { useAuth } from '../../providers/AuthProvider';
import { api, organizationLogoUrl } from '../../lib/api';

export const Sidebar = () => {
  // --- Existing state/hooks: untouched ---
  const { isSidebarOpen, setSidebarOpen } = useUiStore();
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  /*
   * FEATURE (ledger #8 — public logo rendering; the UI placement): when the
   * organization has a logo, the brand block's monogram becomes the tenant
   * logo, fetched through the public logo route (<img> can't attach auth
   * headers). Shares the ['organization'] query key with OrganizationSettings
   * (deduped cache), only runs for an authenticated user, and degrades to
   * the TeamSynch monogram on any failure — the product brand is the honest
   * default, never a broken-image glyph or a thrown sidebar.
   */
  const { data: org } = useQuery({
    queryKey: ['organization'],
    queryFn: async () => {
      const res = await api.get('/organizations');
      return res.data.data;
    },
    enabled: !!user,
    retry: false,
    staleTime: 60_000,
  });

  // Accessibility (additive): Escape dismisses the drawer on mobile viewports.
  // MUST live before the early return below so hook order stays stable.
  // matchMedia-guarded: jsdom (tests) has no matchMedia, and on desktop the
  // docked sidebar should not react to Escape.
  useEffect(() => {
    if (!isSidebarOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.key === 'Escape' &&
        typeof window !== 'undefined' &&
        window.matchMedia &&
        window.matchMedia('(max-width: 1023px)').matches
      ) {
        setSidebarOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSidebarOpen, setSidebarOpen]);

  // --- Existing handler: untouched ---
  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await logout();
    } catch {
      // Local session state is cleared in all cases by the auth provider.
    } finally {
      navigate('/login', { replace: true });
    }
  };

  if (!isSidebarOpen) return null;

  const userInitials = user
    ? `${user.firstName.charAt(0)}${user.lastName.charAt(0)}`.toUpperCase()
    : '';

  return (
    <>
      {/* RESPONSIVE FIX: scrim behind the drawer on phones/tablets.
          Tapping anywhere outside closes the menu. Hidden on lg+ where the
          sidebar docks as a normal flex column. */}
      <div
        className="fixed inset-0 z-40 bg-slate-900/60 backdrop-blur-sm lg:hidden"
        aria-hidden="true"
        onClick={() => setSidebarOpen(false)}
      />

      {/* RESPONSIVE FIX: `fixed … lg:static` turns the exact same panel into an
          overlay drawer below the lg breakpoint and a docked column on desktop. */}
      <aside className="fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-gray-200 bg-sidebar-light shadow-2xl transition-colors dark:border-slate-700/80 dark:bg-sidebar-dark lg:static lg:z-auto lg:w-64 lg:shadow-none xl:w-72">
        {/* Brand block — full-width logo lockup with a compact gradient mark
            (ledger #8: swapped for the tenant logo when the org has one) */}
        <div className="flex h-16 shrink-0 items-center gap-3 border-b border-gray-200 px-5 dark:border-slate-700/80">
          {org?.id && org?.logo ? (
            <img
              src={organizationLogoUrl(org.id, org.logo)}
              alt={`${org.name ?? 'Organization'} logo`}
              className="h-9 w-9 shrink-0 rounded-xl object-cover shadow-md shadow-primary-600/20"
            />
          ) : (
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 text-sm font-bold text-white shadow-md shadow-primary-600/20">
              TS
            </span>
          )}
          <div className="min-w-0">
            <span className="block truncate text-base font-bold text-gray-900 dark:text-white">
              TeamSynch <span className="text-primary-600 dark:text-primary-400">AI</span>
            </span>
            <span className="block text-[11px] font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500">
              Workspace
            </span>
          </div>
          {/* Drawer close button — mobile only (desktop uses the topbar hamburger) */}
          <button
            type="button"
            aria-label="Close navigation menu"
            onClick={() => setSidebarOpen(false)}
            className="ml-auto rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-slate-700 dark:hover:text-gray-200 lg:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Primary navigation — scrolls independently, links are one thumb-friendly row each */}
        <nav aria-label="Primary" className="flex-1 space-y-1 overflow-y-auto p-4">
          <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
            Menu
          </p>
          {navigationConfig.map((item) => {
            if (item.roles && (!user || !item.roles.includes(user.role))) {
              return null;
            }

            const isActive = location.pathname === item.path;
            const Icon = item.icon;

            return (
              <Link
                key={item.path}
                to={item.disabled ? '#' : item.path}
                className={`group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  item.disabled
                    ? 'cursor-not-allowed text-gray-400 opacity-60 dark:text-gray-500'
                    : isActive
                      ? 'bg-primary-50 text-primary-700 dark:bg-primary-500/10 dark:text-primary-400'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-slate-700/70 dark:hover:text-white'
                }`}
              >
                {/* Active-page indicator rail (presentation only) */}
                {isActive && !item.disabled && (
                  <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-primary-600 dark:bg-primary-400" />
                )}
                <Icon
                  className={`h-5 w-5 shrink-0 ${
                    isActive
                      ? 'text-primary-600 dark:text-primary-400'
                      : 'text-gray-400 group-hover:text-gray-500 dark:text-gray-500 dark:group-hover:text-gray-300'
                  }`}
                />
                <span className="truncate">{item.label}</span>
                {item.disabled && (
                  <span className="ml-auto rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:bg-slate-700 dark:text-gray-400">
                    Soon
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Footer: signed-in identity + the ORIGINAL sign-out handler */}
        <div className="shrink-0 border-t border-gray-200 p-4 dark:border-slate-700/80">
          {user && (
            <div className="mb-3 flex items-center gap-3 rounded-lg bg-gray-50 px-3 py-2.5 dark:bg-slate-700/40">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-100 text-xs font-bold text-primary-700 ring-1 ring-primary-200 dark:bg-primary-900/60 dark:text-primary-300 dark:ring-primary-800">
                {userInitials}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">
                  {user.firstName} {user.lastName}
                </p>
                <p className="truncate text-xs capitalize text-gray-500 dark:text-gray-400">
                  {user.role.toLowerCase().replace('_', ' ')}
                </p>
              </div>
            </div>
          )}
          <button
            type="button"
            onClick={() => void handleLogout()}
            disabled={isLoggingOut}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-600 transition-colors hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-60 dark:text-gray-300 dark:hover:bg-rose-500/10 dark:hover:text-rose-400"
          >
            <LogOut className="h-5 w-5" />
            {isLoggingOut ? 'Signing Out…' : 'Sign Out'}
          </button>
        </div>
      </aside>
    </>
  );
};
