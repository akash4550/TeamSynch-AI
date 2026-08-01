import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { Users, Mail, Settings, Plus } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { useAuth } from '../../providers/AuthProvider';

export const TeamDetailsPage = () => {
  const { id } = useParams<{ id: string }>();
  const [activeTab, setActiveTab] = useState<'members' | 'invitations' | 'settings'>('members');
  const { user } = useAuth();

  const canManageTeams =
    user?.role === 'SUPER_ADMIN' ||
    user?.role === 'ADMIN';

  const { data: teamData, isLoading: teamLoading } = useQuery({
    queryKey: ['team', id],
    queryFn: async () => {
      const res = await api.get(`/teams/${id}`);
      return res.data.data;
    },
  });

  const { data: membersData } = useQuery({
    queryKey: ['team-members', id],
    queryFn: async () => {
      const res = await api.get(`/teams/${id}/members`);
      return res.data.data;
    },
  });

  const { data: invitationsData } = useQuery({
    queryKey: ['team-invitations', id],
    queryFn: async () => {
      const res = await api.get(`/teams/${id}/invitations`);
      return res.data.data;
    },
    enabled: Boolean(id) && canManageTeams,
  });

  if (teamLoading) return <div>Loading...</div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white dark:bg-slate-800 p-6 rounded-lg border border-gray-200 dark:border-slate-700 flex items-center justify-between">
        <div className="flex items-center gap-4">
            <div 
                className="w-16 h-16 rounded-lg flex items-center justify-center font-bold text-2xl text-white shadow-sm"
                style={{ backgroundColor: teamData?.color || '#3b82f6' }}
            >
              {teamData?.name.substring(0, 2).toUpperCase()}
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{teamData?.name}</h1>
              <p className="text-gray-500 text-sm mt-1">{teamData?.description || 'No description'}</p>
            </div>
        </div>
        {canManageTeams && (
          <Button variant="primary">
            <Plus className="w-4 h-4 mr-2" />
            Invite Member
          </Button>
        )}
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-slate-700">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('members')}
            className={`whitespace-nowrap pb-4 px-1 border-b-2 font-medium text-sm flex items-center gap-2
              ${activeTab === 'members'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
              }`}
          >
            <Users className="w-4 h-4" />
            Members ({membersData?.length || 0})
          </button>
          {canManageTeams && (
            <button
              onClick={() => setActiveTab('invitations')}
              className={`whitespace-nowrap pb-4 px-1 border-b-2 font-medium text-sm flex items-center gap-2
                ${activeTab === 'invitations'
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                }`}
            >
              <Mail className="w-4 h-4" />
              Invitations ({invitationsData?.length || 0})
            </button>
          )}
          {canManageTeams && (
            <button
              onClick={() => setActiveTab('settings')}
              className={`whitespace-nowrap pb-4 px-1 border-b-2 font-medium text-sm flex items-center gap-2
                ${activeTab === 'settings'
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                }`}
            >
              <Settings className="w-4 h-4" />
              Settings
            </button>
          )}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 overflow-hidden">
        {activeTab === 'members' && (
            <table className="w-full text-sm text-left">
              <thead className="bg-gray-50 dark:bg-slate-900 text-gray-500 dark:text-gray-400">
                <tr>
                  <th className="px-6 py-3 font-medium">User</th>
                  <th className="px-6 py-3 font-medium">Role</th>
                  <th className="px-6 py-3 font-medium">Joined Date</th>
                  <th className="px-6 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                {membersData?.map((membership: any) => (
                  <tr key={membership.id} className="hover:bg-gray-50 dark:hover:bg-slate-700/50">
                    <td className="px-6 py-4 flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold">
                            {membership.user.firstName[0]}
                        </div>
                        <div>
                            <div className="font-medium text-gray-900 dark:text-white">
                                {membership.user.firstName} {membership.user.lastName}
                            </div>
                            <div className="text-xs text-gray-500">{membership.user.email}</div>
                        </div>
                    </td>
                    <td className="px-6 py-4">
                        <span className="bg-gray-100 dark:bg-slate-700 px-2 py-1 rounded text-xs font-medium">
                            {membership.role}
                        </span>
                    </td>
                    <td className="px-6 py-4">{new Date(membership.joinedAt).toLocaleDateString()}</td>
                    <td className="px-6 py-4">
                        {canManageTeams && (
                          <Button variant="outline" size="sm" className="text-xs">
                            Edit Role
                          </Button>
                        )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
        )}

        {activeTab === 'invitations' && canManageTeams && (
             <table className="w-full text-sm text-left">
             <thead className="bg-gray-50 dark:bg-slate-900 text-gray-500 dark:text-gray-400">
               <tr>
                 <th className="px-6 py-3 font-medium">Email</th>
                 <th className="px-6 py-3 font-medium">Status</th>
                 <th className="px-6 py-3 font-medium">Invited By</th>
                 <th className="px-6 py-3 font-medium">Sent Date</th>
               </tr>
             </thead>
             <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
               {invitationsData?.length === 0 ? (
                 <tr>
                     <td colSpan={4} className="px-6 py-8 text-center text-gray-500">No pending invitations</td>
                 </tr>
               ) : invitationsData?.map((invitation: any) => (
                 <tr key={invitation.id} className="hover:bg-gray-50 dark:hover:bg-slate-700/50">
                   <td className="px-6 py-4">{invitation.email}</td>
                   <td className="px-6 py-4">
                       <span className="bg-yellow-100 text-yellow-800 px-2 py-1 rounded text-xs font-medium">
                           {invitation.status}
                       </span>
                   </td>
                   <td className="px-6 py-4">{invitation.invitedBy.firstName}</td>
                   <td className="px-6 py-4">{new Date(invitation.createdAt).toLocaleDateString()}</td>
                 </tr>
               ))}
             </tbody>
           </table>
        )}

        {activeTab === 'settings' && canManageTeams && (
            <div className="p-6">
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Danger Zone</h3>
                <div className="p-4 border border-red-200 bg-red-50 dark:bg-red-900/10 dark:border-red-900/50 rounded-md">
                    <h4 className="text-red-800 dark:text-red-400 font-medium">Delete Team</h4>
                    <p className="text-sm text-red-600 dark:text-red-500 mt-1 mb-4">
                        Once you delete a team, there is no going back. Please be certain.
                    </p>
                    <button className="bg-red-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-red-700 transition-colors">
                        Delete Team
                    </button>
                </div>
            </div>
        )}
      </div>
    </div>
  );
};
