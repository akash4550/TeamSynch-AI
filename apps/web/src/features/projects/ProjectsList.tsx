import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { Search, Plus, Filter, LayoutGrid, List, X } from 'lucide-react';
import { Card, CardBody } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';

// Utility for status colors
const getStatusColor = (status: string) => {
  const map: Record<string, string> = {
    PLANNING: 'bg-blue-100 text-blue-800',
    ACTIVE: 'bg-green-100 text-green-800',
    ON_HOLD: 'bg-yellow-100 text-yellow-800',
    COMPLETED: 'bg-purple-100 text-purple-800',
    ARCHIVED: 'bg-gray-100 text-gray-800',
  };
  return map[status] || map.PLANNING;
};

export const ProjectsList = () => {
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Form State
  const [name, setName] = useState('');
  const [key, setKey] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState('PLANNING');

  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['projects', search, statusFilter],
    queryFn: async () => {
      const res = await api.get('/projects', {
        params: { search: search || undefined, status: statusFilter || undefined }
      });
      return res.data;
    },
  });

  const createProjectMutation = useMutation({
    mutationFn: async (payload: { name: string; key: string; description?: string; status?: string }) => {
      const res = await api.post('/projects', payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      setIsModalOpen(false);
      setName('');
      setKey('');
      setDescription('');
      setStatus('PLANNING');
    },
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !key.trim()) return;

    createProjectMutation.mutate({
      name,
      key: key.toUpperCase(),
      description: description || undefined,
      status,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Projects</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Manage your organization's projects.</p>
        </div>
        <Button variant="primary" onClick={() => setIsModalOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          New Project
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 justify-between">
        <div className="flex gap-4 flex-1">
          <div className="relative max-w-sm w-full">
            <Search className="w-5 h-5 absolute left-3 top-2.5 text-gray-400" />
            <input
              type="text"
              placeholder="Search projects..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-slate-700 dark:bg-slate-800 rounded-md focus:ring-blue-500 focus:border-blue-500 text-sm text-gray-900 dark:text-white"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="relative w-48">
            <Filter className="w-4 h-4 absolute left-3 top-3 text-gray-400" />
            <select
              className="w-full pl-9 pr-4 py-2 border border-gray-300 dark:border-slate-700 dark:bg-slate-800 rounded-md text-sm text-gray-900 dark:text-white appearance-none"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">All Statuses</option>
              <option value="PLANNING">Planning</option>
              <option value="ACTIVE">Active</option>
              <option value="ON_HOLD">On Hold</option>
              <option value="COMPLETED">Completed</option>
            </select>
          </div>
        </div>

        <div className="flex bg-gray-100 dark:bg-slate-800 p-1 rounded-md border border-gray-200 dark:border-slate-700">
          <button
            onClick={() => setViewMode('grid')}
            className={`p-1.5 rounded ${viewMode === 'grid' ? 'bg-white dark:bg-slate-700 shadow-sm' : 'text-gray-500'}`}
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode('table')}
            className={`p-1.5 rounded ${viewMode === 'table' ? 'bg-white dark:bg-slate-700 shadow-sm' : 'text-gray-500'}`}
          >
            <List className="w-4 h-4" />
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-gray-500">Loading projects...</div>
      ) : !data?.data || data.data.length === 0 ? (
        <Card className="text-center py-16">
          <CardBody>
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No projects found</h3>
            <p className="text-gray-500 dark:text-gray-400 mb-6">Get started by creating your first project.</p>
            <Button variant="primary" onClick={() => setIsModalOpen(true)}>Create Project</Button>
          </CardBody>
        </Card>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {data.data.map((project: any) => (
            <Card key={project.id} className="hover:shadow-md transition-shadow cursor-pointer">
              <CardBody className="p-6">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded bg-gray-100 dark:bg-slate-700 flex items-center justify-center font-bold text-gray-600 dark:text-gray-300">
                      {project.key}
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900 dark:text-white truncate max-w-[150px]">{project.name}</h3>
                      <p className="text-xs text-gray-500">{project.key}</p>
                    </div>
                  </div>
                  <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${getStatusColor(project.status)}`}>
                    {project.status}
                  </span>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2 mb-6">
                  {project.description || 'No description provided.'}
                </p>
                <div className="flex justify-between items-center text-xs text-gray-500 border-t border-gray-100 dark:border-slate-700 pt-4 mt-4">
                  <span>Owner: {project.owner?.firstName || 'Admin'}</span>
                  <span>Created: {new Date(project.createdAt).toLocaleDateString()}</span>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700">
          <table className="w-full text-sm text-left text-gray-500 dark:text-gray-400">
            <thead className="text-xs text-gray-700 uppercase bg-gray-50 dark:bg-slate-900 dark:text-gray-300 border-b border-gray-200 dark:border-slate-700">
              <tr>
                <th className="px-6 py-4">Project</th>
                <th className="px-6 py-4">Key</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Owner</th>
                <th className="px-6 py-4">Created Date</th>
              </tr>
            </thead>
            <tbody>
              {data.data.map((project: any) => (
                <tr key={project.id} className="border-b border-gray-100 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700/50 cursor-pointer">
                  <td className="px-6 py-4 font-medium text-gray-900 dark:text-white">{project.name}</td>
                  <td className="px-6 py-4">{project.key}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${getStatusColor(project.status)}`}>
                      {project.status}
                    </span>
                  </td>
                  <td className="px-6 py-4">{project.owner?.firstName || 'Admin'} {project.owner?.lastName || ''}</td>
                  <td className="px-6 py-4">{new Date(project.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Project Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-lg max-w-md w-full p-6 shadow-xl border border-gray-200 dark:border-slate-700">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Create New Project</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-500">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Project Name *</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (!key) {
                      setKey(e.target.value.replace(/[^a-zA-Z0-9]/g, '').slice(0, 5).toUpperCase());
                    }
                  }}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-md dark:bg-slate-700 dark:text-white text-sm"
                  placeholder="Website Redesign"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Project Key (2-10 uppercase letters/numbers) *</label>
                <input
                  type="text"
                  required
                  maxLength={10}
                  value={key}
                  onChange={(e) => setKey(e.target.value.toUpperCase())}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-md dark:bg-slate-700 dark:text-white text-sm uppercase"
                  placeholder="WEB"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
                <textarea
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-md dark:bg-slate-700 dark:text-white text-sm"
                  placeholder="Description of project objectives..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Initial Status</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-md dark:bg-slate-700 dark:text-white text-sm"
                >
                  <option value="PLANNING">Planning</option>
                  <option value="ACTIVE">Active</option>
                  <option value="ON_HOLD">On Hold</option>
                </select>
              </div>
              <div className="flex justify-end space-x-2 pt-4 border-t border-gray-100 dark:border-slate-700">
                <Button type="button" variant="secondary" onClick={() => setIsModalOpen(false)}>Cancel</Button>
                <Button type="submit" variant="primary" disabled={createProjectMutation.isPending}>
                  {createProjectMutation.isPending ? 'Creating...' : 'Create Project'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
