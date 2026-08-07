import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from '../components/layout/Sidebar';
import { Topbar } from '../components/layout/Topbar';
import { useUiStore } from '../store/uiStore';
import { AIAssistantPanel } from '../features/ai/AIAssistantPanel';
import { BillingAlertBanner } from '../modules/billing/components/BillingAlertBanner';
import { Bot } from 'lucide-react';
import { useAuth } from '../providers/AuthProvider';

export const DashboardLayout = () => {
  // --- Existing state/hooks: untouched ---
  useUiStore((state) => state.theme);
  const [isAIPanelOpen, setIsAIPanelOpen] = useState(false);
  const { user } = useAuth();

  // RESPONSIVE FIX (additive, no existing logic changed): after a navigation on
  // phone/tablet viewports, auto-dismiss the drawer so the destination page is
  // visible. Guarded so non-browser test environments without matchMedia are safe.
  const location = useLocation();
  const setSidebarOpen = useUiStore((state) => state.setSidebarOpen);
  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(max-width: 1023px)').matches) {
      setSidebarOpen(false);
    }
  }, [location.pathname, setSidebarOpen]);

  const canManageBilling =
    user?.role === 'SUPER_ADMIN' ||
    user?.role === 'ADMIN';

  return (
    // App frame: docked sidebar column + independently scrolling content column
    <div className="flex h-screen overflow-hidden bg-gray-50 transition-colors dark:bg-slate-900">
      <Sidebar />

      {/* min-w-0 is essential: lets flex children (tables, kanban) shrink instead
          of forcing horizontal overflow on small screens */}
      <div className="flex min-w-0 flex-1 flex-col">
        {canManageBilling && <BillingAlertBanner />}
        <Topbar />

        <main className="relative flex-1 overflow-y-auto">
          {/* Responsive page gutter and readable max width on very wide monitors */}
          <div className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
            <Outlet />
          </div>

          {/* AI Assistant FAB — centered 56px touch target, branded shadow.
              z-30 keeps it BELOW the mobile drawer scrim (z-40) so it can't
              float visibly on top of the dimmed backdrop. */}
          {!isAIPanelOpen && (
            <button
              onClick={() => setIsAIPanelOpen(true)}
              className="fixed bottom-6 right-6 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-primary-600 text-white shadow-lg shadow-primary-600/25 transition-all hover:scale-105 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900"
              title="Open AI Assistant"
            >
              <Bot size={24} />
            </button>
          )}

          <AIAssistantPanel isOpen={isAIPanelOpen} onClose={() => setIsAIPanelOpen(false)} />
        </main>
      </div>
    </div>
  );
};
