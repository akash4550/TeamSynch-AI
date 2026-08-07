import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { Card, CardBody, CardHeader, CardTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { useAuth } from '../../providers/AuthProvider';
import { useNavigate } from 'react-router-dom';
import { FolderKanban, CheckCircle2, Clock, Users, Activity } from 'lucide-react';

/*
 * UI PASS (#UI-dashboard-kpi-hue, 2026-08-07): the 4th KPI tile used a
 * literal purple-* palette — the app's single off-accent KPI hue.
 * Aligned to indigo (the established 4th-KPI hue used by CRMDashboard
 * and the analytics MetricCard union). Value/text contracts untouched.
 */
export const Dashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  // --- Existing data fetching: untouched ---
  /*
   * BUG FIX (stat tiles computed from truncated first pages): both list
   * endpoints paginate by default (projects limit=20, tasks limit=50), and
   * every tile counted only the returned page — "Total Projects" capped at
   * 20 no matter the real org size, and Completed/Pending Tasks were skewed
   * to the newest 50 tasks (default sort is createdAt desc, so older DONE
   * tasks were systematically under-counted). Dashboards need the wide view,
   * so both queries fetch with an explicit limit (500 since the ledger #6
   * aggregate-cap raise — truncation past it is declared under the KPIs;
   * the CRM surfaces), and "Total Projects" reads the API's exact `total`
   * field instead of the fetched array's length. Stored body shapes are
   * unchanged, so the other consumers of these shared cache keys (TasksPage)
   * are unaffected.
   */
  /*
   * BUG FIX (fabricated zero-metrics on the landing page — Bug #34): these
   * three queries surfaced only `isLoading`, so a rejected GET (500, network
   * down, expired 401) painted AUTHORITATIVE-LOOKING LIES: "Active
   * Projects: 0", "Completed Tasks: 0", "Total Projects: 0", and "No recent
   * workspace activities logged yet." — the first thing every user sees
   * after login. Failing widgets now show an honest "—" (unknown, not
   * zero), a `role="alert"` strip with the server's message + Retry covers
   * the stat grid, and the activity feed shows its own failure block with
   * Retry instead of the fabricated "no activity" line. Same truth
   * pattern as Bug #31/#32/#33.
   */
  const {
    data: projectsData,
    isLoading: isLoadingProjects,
    isError: projectsIsError,
    error: projectsError,
    refetch: refetchProjects,
  } = useQuery({
    /*
     * BUG FIX (React Query key collision / cache poisoning): Dashboard and
     * TasksPage both used the bare ['projects'] key with DIFFERENT queryFns
     * and DIFFERENT stored shapes (this one wrapped res.data, TasksPage
     * unwrapped res.data.data). Same key = shared cache entry decided by
     * mount order: Dashboard-first emptied TasksPage's project select
     * (blocking task creation), TasksPage-first emptied these tiles. Both
     * pages now share the param-aware key ['projects', { limit: 500 }], an
     * identical request, and the unwrapped `{ projects, total }` shape.
     * (Ledger #6: key param mirrors the raised fetch limit.)
     */
    queryKey: ['projects', { limit: 500 }],
    queryFn: async () => {
      const res = await api.get('/projects', { params: { limit: 500 } });
      return res.data.data;
    },
  });

  const {
    data: tasksData,
    isLoading: isLoadingTasks,
    isError: tasksIsError,
    error: tasksError,
    refetch: refetchTasks,
  } = useQuery({
    queryKey: ['tasks'],
    queryFn: async () => {
      const res = await api.get('/tasks', { params: { limit: 500 } });
      return res.data;
    },
  });

  const {
    data: activitiesData,
    isLoading: isLoadingActivities,
    isError: activitiesIsError,
    error: activitiesError,
    refetch: refetchActivities,
  } = useQuery({
    queryKey: ['crm', 'activities'],
    queryFn: async () => {
      const res = await api.get('/crm/activities');
      return res.data;
    },
  });

  // Shared `{ error: { message } }` envelope extraction (string-only) — the
  // stat strip surfaces the first failing query's message.
  const statsErrorMessage = (() => {
    for (const e of [projectsError, tasksError]) {
      const m = (e as any)?.response?.data?.error?.message;
      if (typeof m === 'string' && m.length > 0) return m;
    }
    return null;
  })();
  const activitiesErrorMessage = (() => {
    const m = (activitiesError as any)?.response?.data?.error?.message;
    return typeof m === 'string' && m.length > 0 ? m : null;
  })();

  // Unwrapped shape `{ projects, total }` — shared with TasksPage since the
  // cache-key unification (Bug #30 fix), so both readers must agree.
  const projects = Array.isArray(projectsData?.projects)
  ? projectsData.projects
  : [];

  const tasks = Array.isArray(tasksData?.data)
  ? tasksData.data
  : [];

  const activities = Array.isArray(activitiesData?.data)
  ? activitiesData.data
  : [];

  // Exact organization-wide count from the API envelope — not the length of
  // the fetched page — so it stays correct even beyond the fetch limit.
  const projectsTotal = typeof projectsData?.total === 'number'
    ? projectsData.total
    : projects.length;

  // --- Existing derived metrics: untouched ---
  const activeProjects = projects.filter((p: any) => p.status === 'ACTIVE' || p.status === 'PLANNING').length;
  const completedTasks = tasks.filter((t: any) => t.status === 'DONE').length;
  const pendingTasks = tasks.filter((t: any) => t.status !== 'DONE').length;

  /*
   * Stat tile config — maps the SAME computed values above onto a consistent
   * card design (neutral number + colored icon tile = cohesive, scannable row).
   */
  const stats = [
    {
      label: 'Active Projects',
      // Bug #34: "—" = unknown (read failed); never fabricate a 0.
      value: isLoadingProjects ? '...' : projectsIsError ? '—' : activeProjects,
      icon: FolderKanban,
      tile: 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
    },
    {
      label: 'Completed Tasks',
      value: isLoadingTasks ? '...' : tasksIsError ? '—' : completedTasks,
      icon: CheckCircle2,
      tile: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400',
    },
    {
      label: 'Pending Work',
      value: isLoadingTasks ? '...' : tasksIsError ? '—' : pendingTasks,
      icon: Clock,
      tile: 'bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400',
    },
    {
      label: 'Total Projects',
      value: isLoadingProjects ? '...' : projectsIsError ? '—' : projectsTotal,
      icon: Users,
      tile: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400',
    },
  ];

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Page header — title/description stack on mobile, date sits right on sm+ */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
            Welcome back, {user?.firstName || 'User'}!
          </h1>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Here is an overview of your organization workspace today.
          </p>
        </div>
        <p className="shrink-0 text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">
          {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        </p>
      </div>

      {/* Bug #34: one honest failure strip covers the KPI grid — replaces the
          old behavior of silently painting fabricated zeros on error. */}
      {(projectsIsError || tasksIsError) && (
        <div
          role="alert"
          className="flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-between dark:border-red-900/50 dark:bg-red-900/10"
        >
          <div className="min-w-0">
            <p className="text-sm font-medium text-red-700 dark:text-red-300">We couldn't load your dashboard stats</p>
            <p className="text-sm text-red-600 dark:text-red-400">
              {statsErrorMessage ?? 'Something went wrong while fetching your stats. Your data is safe — please try again.'}
            </p>
          </div>
          <Button
            variant="secondary"
            className="shrink-0"
            onClick={() => {
              if (projectsIsError) refetchProjects();
              if (tasksIsError) refetchTasks();
            }}
          >
            Retry
          </Button>
        </div>
      )}

      {/* FEATURE (ledger #6 — truncation honesty): Completed/Pending Task
          and Active Project counts derive from the fetched pages (caps now
          500). When the org outgrows the fetch, declare the coverage —
          totals themselves stay exact via the API's `total`. */}
      {!tasksIsError && (tasksData?.total ?? 0) > tasks.length && (
        <p className="-mb-2 text-xs text-gray-500 dark:text-gray-400">
          Task counts cover the first {tasks.length} of {tasksData?.total} tasks.
        </p>
      )}
      {!projectsIsError && projectsTotal > projects.length && (
        <p className="-mb-2 text-xs text-gray-500 dark:text-gray-400">
          Active-project mix covers the first {projects.length} of {projectsTotal} projects.
        </p>
      )}

      {/* KPI grid: 1 col (phone) -> 2 col (tablet) -> 4 col (desktop) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-4">
        {stats.map(({ label, value, icon: Icon, tile }) => (
          <Card key={label} className="transition-shadow hover:shadow-md">
            <CardBody className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  {label}
                </p>
                <span className="mt-1 block text-3xl font-bold tabular-nums text-gray-900 dark:text-white">
                  {value}
                </span>
              </div>
              <div className={`shrink-0 rounded-xl p-3 ${tile}`}>
                <Icon className="h-6 w-6" />
              </div>
            </CardBody>
          </Card>
        ))}
      </div>

      {/* Content grid: activity feed (2/3) + quick actions (1/3), stacks on mobile */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span className="rounded-lg bg-blue-50 p-1.5 dark:bg-blue-900/30">
                <Activity className="h-5 w-5 text-blue-500" />
              </span>
              Recent Workspace Activity
            </CardTitle>
          </CardHeader>
          <CardBody>
            {isLoadingActivities ? (
              <div className="p-4 text-center text-sm text-gray-500">Loading activities...</div>
            ) : activitiesIsError ? (
              // Bug #34: honest failure block — never claim "no activity" when
              // the read simply failed.
              <div role="alert" className="flex flex-col items-center gap-2 p-8 text-center">
                <p className="text-sm font-medium text-red-700 dark:text-red-300">We couldn't load recent activity</p>
                <p className="text-sm text-red-600 dark:text-red-400">
                  {activitiesErrorMessage ?? 'Something went wrong while fetching recent activity. Your data is safe — please try again.'}
                </p>
                <Button variant="secondary" className="mt-2" onClick={() => refetchActivities()}>
                  Retry
                </Button>
              </div>
            ) : activities.length === 0 ? (
              // Friendlier empty state, same data condition as before
              <div className="flex flex-col items-center gap-2 p-8 text-center">
                <Activity className="h-8 w-8 text-gray-300 dark:text-gray-600" />
                <p className="text-sm text-gray-500">No recent workspace activities logged yet.</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100 dark:divide-slate-700/80">
                {activities.slice(0, 6).map((act: any) => (
                  <div key={act.id} className="flex items-start justify-between gap-4 py-3">
                    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-800 dark:bg-blue-900/50 dark:text-blue-200">
                        {act.type}
                      </span>
                      <span className="truncate text-sm font-medium text-gray-900 dark:text-white">
                        {act.description}
                      </span>
                    </div>
                    <span className="shrink-0 text-xs tabular-nums text-gray-400">
                      {new Date(act.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          {/* Original buttons, variants and navigate() handlers — unchanged */}
          <CardBody className="space-y-3">
            <Button variant="primary" className="w-full justify-start" onClick={() => navigate('/projects')}>
              <FolderKanban className="w-4 h-4 mr-2" /> View & Create Projects
            </Button>
            <Button variant="secondary" className="w-full justify-start" onClick={() => navigate('/tasks')}>
              <CheckCircle2 className="w-4 h-4 mr-2" /> View & Create Tasks
            </Button>
            <Button variant="secondary" className="w-full justify-start" onClick={() => navigate('/crm/clients')}>
              <Users className="w-4 h-4 mr-2" /> Manage Clients
            </Button>
            <Button variant="ghost" className="w-full justify-start" onClick={() => navigate('/analytics')}>
              <Activity className="w-4 h-4 mr-2" /> View Analytics
            </Button>
          </CardBody>
        </Card>
      </div>
    </div>
  );
};
