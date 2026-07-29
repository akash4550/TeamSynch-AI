import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './core/api/queryClient';

import { DashboardLayout } from './layouts/DashboardLayout';
import { ProtectedRoute } from './routes/ProtectedRoute';
import { ForbiddenError, NotFoundError } from './features/errors/ErrorPages';
import { SocketProvider } from './providers/SocketProvider';
import { ThemeProvider } from './providers/ThemeProvider';
import { LandingPage } from './pages/LandingPage';
import { AuthProvider } from './providers/AuthProvider';
import { LoginPage } from './features/auth/LoginPage';

// Lazy-Loaded Route Components for Code-Splitting
const Dashboard = lazy(() => import('./features/dashboard/Dashboard').then((m) => ({ default: m.Dashboard })));
const ProjectsList = lazy(() => import('./features/projects/ProjectsList').then((m) => ({ default: m.ProjectsList })));
const TasksPage = lazy(() => import('./features/tasks/TasksPage').then((m) => ({ default: m.TasksPage })));
const TeamsPage = lazy(() => import('./features/teams/TeamsPage').then((m) => ({ default: m.TeamsPage })));
const TeamDetailsPage = lazy(() => import('./features/teams/TeamDetailsPage').then((m) => ({ default: m.TeamDetailsPage })));
const DocumentsPage = lazy(() => import('./features/documents/DocumentsPage').then((m) => ({ default: m.DocumentsPage })));
const CRMDashboard = lazy(() => import('./features/crm/CRMDashboard').then((m) => ({ default: m.CRMDashboard })));
const ClientsPage = lazy(() => import('./features/crm/ClientsPage').then((m) => ({ default: m.ClientsPage })));
const ClientDetailPage = lazy(() => import('./features/crm/ClientDetailPage').then((m) => ({ default: m.ClientDetailPage })));
const ContactsPage = lazy(() => import('./features/crm/ContactsPage').then((m) => ({ default: m.ContactsPage })));
const LeadsPage = lazy(() => import('./features/crm/LeadsPage').then((m) => ({ default: m.LeadsPage })));
const OpportunitiesPage = lazy(() => import('./features/crm/OpportunitiesPage').then((m) => ({ default: m.OpportunitiesPage })));
const PipelineBoard = lazy(() => import('./features/crm/PipelineBoard').then((m) => ({ default: m.PipelineBoard })));
const CalendarPage = lazy(() => import('./features/calendar/CalendarPage').then((m) => ({ default: m.CalendarPage })));
const WorkspaceAiChatPage = lazy(() => import('./features/ai/WorkspaceAiChatPage').then((m) => ({ default: m.WorkspaceAiChatPage })));
const AuditLogViewerPage = lazy(() => import('./features/system/AuditLogViewerPage').then((m) => ({ default: m.AuditLogViewerPage })));
const SubscriptionSettingsPage = lazy(() => import('./features/orgs/SubscriptionSettingsPage').then((m) => ({ default: m.SubscriptionSettingsPage })));
const OrganizationSettings = lazy(() => import('./features/orgs/OrganizationSettings').then((m) => ({ default: m.OrganizationSettings })));
const UserManagement = lazy(() => import('./features/users/UserManagement').then((m) => ({ default: m.UserManagement })));
const AnalyticsLayout = lazy(() => import('./features/analytics/AnalyticsLayout').then((m) => ({ default: m.AnalyticsLayout })));
const JobsDashboard = lazy(() => import('./features/system/JobsDashboard').then((m) => ({ default: m.JobsDashboard })));
const SearchResultsPage = lazy(() => import('./features/search/SearchResultsPage').then((m) => ({ default: m.SearchResultsPage })));

/**
 * Lightweight Page Suspense Fallback Skeleton
 */
const PageSkeleton = () => (
  <div className="p-6 space-y-6 animate-pulse">
    <div className="h-8 bg-gray-200 dark:bg-slate-700 rounded-md w-64 mb-2" />
    <div className="h-4 bg-gray-200 dark:bg-slate-700 rounded-md w-96 mb-6" />
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      <div className="h-32 bg-gray-200 dark:bg-slate-700 rounded-xl" />
      <div className="h-32 bg-gray-200 dark:bg-slate-700 rounded-xl" />
      <div className="h-32 bg-gray-200 dark:bg-slate-700 rounded-xl" />
    </div>
    <div className="h-64 bg-gray-200 dark:bg-slate-700 rounded-xl" />
  </div>
);

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <SocketProvider>
            <ThemeProvider>
              <Suspense fallback={<PageSkeleton />}>
                <Routes>
                  <Route path="/" element={<LandingPage />} />
                  <Route path="/login" element={<LoginPage />} />
                
                  {/* Protected Application Routes */}
                  <Route element={<ProtectedRoute />}>
                    <Route element={<DashboardLayout />}>
                      <Route path="/dashboard" element={<Dashboard />} />

                      {/* Authenticated Workspace Features */}
                      <Route path="/projects" element={<ProjectsList />} />
                      <Route path="/tasks" element={<TasksPage />} />
                      <Route path="/teams" element={<TeamsPage />} />
                      <Route path="/teams/:id" element={<TeamDetailsPage />} />
                      <Route path="/calendar" element={<CalendarPage />} />
                      <Route path="/documents" element={<DocumentsPage />} />
                      <Route path="/ai-chat" element={<WorkspaceAiChatPage />} />
                      <Route path="/crm" element={<CRMDashboard />} />
                      <Route path="/crm/clients" element={<ClientsPage />} />
                      <Route path="/crm/clients/:id" element={<ClientDetailPage />} />
                      <Route path="/crm/contacts" element={<ContactsPage />} />
                      <Route path="/crm/leads" element={<LeadsPage />} />
                      <Route path="/crm/opportunities" element={<OpportunitiesPage />} />
                      <Route path="/crm/pipeline" element={<PipelineBoard />} />
                      <Route path="/analytics" element={<AnalyticsLayout />} />
                      <Route path="/search" element={<SearchResultsPage />} />

                      {/* Protected Role-Based Admin Routes */}
                      <Route element={<ProtectedRoute allowedRoles={['SUPER_ADMIN', 'ADMIN', 'MANAGER']} />}>
                        <Route path="/users" element={<UserManagement />} />
                        <Route path="/organization" element={<OrganizationSettings />} />
                      </Route>

                      <Route element={<ProtectedRoute allowedRoles={['SUPER_ADMIN', 'ADMIN']} />}>
                        <Route path="/settings" element={<SubscriptionSettingsPage />} />
                        <Route path="/audit" element={<AuditLogViewerPage />} />
                      </Route>

                      <Route element={<ProtectedRoute allowedRoles={['SUPER_ADMIN']} />}>
                        <Route path="/system/jobs" element={<JobsDashboard />} />
                      </Route>
                    </Route>
                  </Route>

                  {/* Error Routes */}
                  <Route path="/403" element={<ForbiddenError />} />
                  <Route path="*" element={<NotFoundError />} />
                </Routes>
              </Suspense>
            </ThemeProvider>
          </SocketProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
