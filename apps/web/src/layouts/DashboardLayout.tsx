import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from '../components/layout/Sidebar';
import { Topbar } from '../components/layout/Topbar';
import { useUiStore } from '../store/uiStore';
import { AIAssistantPanel } from '../features/ai/AIAssistantPanel';
import { BillingAlertBanner } from '../modules/billing/components/BillingAlertBanner';
import { Bot } from 'lucide-react';
import { useAuth } from '../providers/AuthProvider';

export const DashboardLayout = () => {
  useUiStore((state) => state.theme); 
  const [isAIPanelOpen, setIsAIPanelOpen] = useState(false);
  const { user } = useAuth();

  const canManageBilling =
    user?.role === 'SUPER_ADMIN' ||
    user?.role === 'ADMIN';

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-slate-900 overflow-hidden transition-colors">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        {canManageBilling && <BillingAlertBanner />}
        <Topbar />
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 relative">
          <Outlet />
          
          {/* AI Assistant FAB */}
          {!isAIPanelOpen && (
            <button
              onClick={() => setIsAIPanelOpen(true)}
              className="fixed bottom-6 right-6 p-4 bg-blue-600 text-white rounded-full shadow-lg hover:bg-blue-700 transition-transform hover:scale-105 z-40"
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
