import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Card, Title, Text, Button, Badge } from '@tremor/react';
import { ArrowLeftIcon, PhoneIcon, EnvelopeIcon, GlobeAltIcon, PlusIcon } from '@heroicons/react/24/outline';
import { useClient, useActivities, useCreateActivity } from './hooks/useCRMQueries';

export const ClientDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const [activityNote, setActivityNote] = useState('');
  const [activityType, setActivityType] = useState<'NOTE' | 'CALL' | 'EMAIL' | 'MEETING'>('NOTE');

  const { data: client, isLoading } = useClient(id || '');
  const { data: activities, isLoading: isLoadingActivities } = useActivities({ clientId: id });
  const createActivityMutation = useCreateActivity();

  const handleLogActivity = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activityNote.trim() || !id) return;

    createActivityMutation.mutate(
      {
        clientId: id,
        type: activityType,
        content: activityNote,
      },
      {
        onSuccess: () => {
          setActivityNote('');
        },
      }
    );
  };

  if (isLoading) {
    return <div className="p-6 text-gray-500">Loading client details...</div>;
  }

  if (!client) {
    return (
      <div className="p-6">
        <Text>Client not found.</Text>
        <Link to="/crm/clients"><Button size="xs" className="mt-4">Back to Clients</Button></Link>
      </div>
    );
  }

  return (
    <div className="p-6 h-full overflow-auto bg-gray-50 dark:bg-gray-900 space-y-6">
      <Link to="/crm/clients" className="inline-flex items-center text-sm text-gray-500 hover:text-gray-900 dark:hover:text-white">
        <ArrowLeftIcon className="w-4 h-4 mr-1" /> Back to Clients
      </Link>

      <div className="flex justify-between items-start">
        <div>
          <div className="flex items-center gap-3">
            <Title className="text-2xl dark:text-white">{client.name}</Title>
            <Badge color={client.status === 'ACTIVE' ? 'emerald' : 'gray'}>{client.status}</Badge>
          </div>
          <Text className="dark:text-gray-400">{client.industry || 'No industry specified'}</Text>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Contact info card */}
        <Card className="lg:col-span-1 space-y-4">
          <Title className="text-base dark:text-white">Client Information</Title>
          <div className="space-y-3 text-sm text-gray-600 dark:text-gray-300">
            {client.email && (
              <div className="flex items-center gap-2">
                <EnvelopeIcon className="w-4 h-4 text-gray-400" />
                <span>{client.email}</span>
              </div>
            )}
            {client.phone && (
              <div className="flex items-center gap-2">
                <PhoneIcon className="w-4 h-4 text-gray-400" />
                <span>{client.phone}</span>
              </div>
            )}
            {client.website && (
              <div className="flex items-center gap-2">
                <GlobeAltIcon className="w-4 h-4 text-gray-400" />
                <a href={client.website} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
                  {client.website}
                </a>
              </div>
            )}
            {client.address && (
              <div className="pt-2 border-t border-gray-100 dark:border-gray-800">
                <Text className="text-xs text-gray-400">Address</Text>
                <p>{client.address}</p>
              </div>
            )}
          </div>
        </Card>

        {/* Activity & Notes */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <Title className="text-base mb-4 dark:text-white">Log Activity</Title>
            <form onSubmit={handleLogActivity} className="space-y-3">
              <div className="flex gap-2">
                {(['NOTE', 'CALL', 'EMAIL', 'MEETING'] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setActivityType(type)}
                    className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                      activityType === type
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300'
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>
              <textarea
                rows={3}
                required
                value={activityNote}
                onChange={(e) => setActivityNote(e.target.value)}
                placeholder="Log activity details or notes..."
                className="w-full p-3 border rounded-md dark:bg-gray-800 dark:border-gray-700 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <div className="flex justify-end">
                <Button type="submit" size="xs" icon={PlusIcon} loading={createActivityMutation.isPending}>
                  Save Activity
                </Button>
              </div>
            </form>
          </Card>

          <Card>
            <Title className="text-base mb-4 dark:text-white">Activity History</Title>
            {isLoadingActivities ? (
              <Text>Loading activity history...</Text>
            ) : !activities || activities.length === 0 ? (
              <Text>No activity logged yet.</Text>
            ) : (
              <div className="space-y-4">
                {activities.map((act) => (
                  <div key={act.id} className="border-b border-gray-100 dark:border-gray-800 pb-3">
                    <div className="flex justify-between items-center mb-1">
                      <Badge color="blue" size="xs">{act.type}</Badge>
                      <span className="text-xs text-gray-400">
                        {new Date(act.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-sm text-gray-800 dark:text-gray-200">{act.description}</p>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
};
