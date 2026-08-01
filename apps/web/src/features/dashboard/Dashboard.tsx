import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { Card, CardBody, CardHeader, CardTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { useAuth } from '../../providers/AuthProvider';
import { useNavigate } from 'react-router-dom';
import { FolderKanban, CheckCircle2, Clock, Users, Activity } from 'lucide-react';

export const Dashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const { data: projectsData, isLoading: isLoadingProjects } = useQuery({
    queryKey: ['projects'],
    queryFn: async () => {
      const res = await api.get('/projects');
      return res.data;
    },
  });

  const { data: tasksData, isLoading: isLoadingTasks } = useQuery({
    queryKey: ['tasks'],
    queryFn: async () => {
      const res = await api.get('/tasks');
      return res.data;
    },
  });

  const { data: activitiesData, isLoading: isLoadingActivities } = useQuery({
    queryKey: ['crm', 'activities'],
    queryFn: async () => {
      const res = await api.get('/crm/activities');
      return res.data;
    },
  });

  const projects = Array.isArray(projectsData?.data?.projects)
  ? projectsData.data.projects
  : [];

  const tasks = Array.isArray(tasksData?.data)
  ? tasksData.data
  : [];

  const activities = Array.isArray(activitiesData?.data)
  ? activitiesData.data
  : [];

  const activeProjects = projects.filter((p: any) => p.status === 'ACTIVE' || p.status === 'PLANNING').length;
  const completedTasks = tasks.filter((t: any) => t.status === 'DONE').length;
  const pendingTasks = tasks.filter((t: any) => t.status !== 'DONE').length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Welcome back, {user?.firstName || 'User'}!
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mt-1">
          Here is an overview of your organization workspace today.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="hover:shadow-md transition-shadow">
          <CardBody className="flex items-center justify-between p-6">
            <div>
              <span className="text-3xl font-bold text-blue-600 dark:text-blue-400">
                {isLoadingProjects ? '...' : activeProjects}
              </span>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mt-1">Active Projects</p>
            </div>
            <div className="p-3 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-lg">
              <FolderKanban className="w-6 h-6" />
            </div>
          </CardBody>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardBody className="flex items-center justify-between p-6">
            <div>
              <span className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">
                {isLoadingTasks ? '...' : completedTasks}
              </span>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mt-1">Completed Tasks</p>
            </div>
            <div className="p-3 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-lg">
              <CheckCircle2 className="w-6 h-6" />
            </div>
          </CardBody>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardBody className="flex items-center justify-between p-6">
            <div>
              <span className="text-3xl font-bold text-amber-600 dark:text-amber-400">
                {isLoadingTasks ? '...' : pendingTasks}
              </span>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mt-1">Pending Work</p>
            </div>
            <div className="p-3 bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 rounded-lg">
              <Clock className="w-6 h-6" />
            </div>
          </CardBody>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardBody className="flex items-center justify-between p-6">
            <div>
              <span className="text-3xl font-bold text-purple-600 dark:text-purple-400">
                {isLoadingProjects ? '...' : projects.length}
              </span>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mt-1">Total Projects</p>
            </div>
            <div className="p-3 bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded-lg">
              <Users className="w-6 h-6" />
            </div>
          </CardBody>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-blue-500" />
              Recent Workspace Activity
            </CardTitle>
          </CardHeader>
          <CardBody>
            {isLoadingActivities ? (
              <div className="p-4 text-center text-sm text-gray-500">Loading activities...</div>
            ) : activities.length === 0 ? (
              <div className="p-4 text-center text-sm text-gray-500">No recent workspace activities logged yet.</div>
            ) : (
              <div className="divide-y divide-gray-100 dark:divide-slate-700">
                {activities.slice(0, 6).map((act: any) => (
                  <div key={act.id} className="py-3 flex items-start justify-between">
                    <div>
                      <span className="text-xs font-semibold px-2 py-0.5 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded mr-2">
                        {act.type}
                      </span>
                      <span className="text-sm text-gray-900 dark:text-white font-medium">{act.description}</span>
                    </div>
                    <span className="text-xs text-gray-400 shrink-0 ml-4">
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
