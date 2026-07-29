import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../core/api/client';
import { Card, Title, Text, Badge, Button, Flex, Grid } from '@tremor/react';
import { Calendar, RefreshCw, CheckCircle2, ArrowRight } from 'lucide-react';

export interface CalendarFeedResponse {
  tasks: any[];
  projects: any[];
  events: any[];
}

export const CalendarSettingsPage = () => {
  const queryClient = useQueryClient();
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const { data: feedData, isLoading } = useQuery({
    queryKey: ['calendar', 'feed'],
    queryFn: async () => {
      const { data } = await apiClient.get<{ data: CalendarFeedResponse }>('/calendar');
      return data.data;
    },
  });

  const connectMutation = useMutation({
    mutationFn: async (provider: 'GOOGLE' | 'OUTLOOK') => {
      const { data } = await apiClient.get<{ data: { authUrl: string } }>('/calendar/connect', {
        params: { provider },
      });
      return data.data;
    },
    onSuccess: (data) => {
      if (data.authUrl) {
        window.location.href = data.authUrl;
      }
    },
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      const { data } = await apiClient.post<{ data: { jobId: string; status: string } }>('/calendar/sync');
      return data.data;
    },
    onSuccess: () => {
      setSyncMessage('Two-way calendar sync triggered. Syncing tasks & deadlines...');
      queryClient.invalidateQueries({ queryKey: ['calendar', 'feed'] });
      setTimeout(() => setSyncMessage(null), 5000);
    },
  });

  if (isLoading) {
    return <div className="p-6 text-gray-500">Loading calendar integration settings...</div>;
  }

  const tasksCount = feedData?.tasks?.length || 0;
  const projectsCount = feedData?.projects?.length || 0;

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <Flex className="mb-6">
        <div>
          <div className="flex items-center gap-2">
            <Calendar className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            <Title className="text-2xl dark:text-white">Two-Way Calendar Sync Settings</Title>
          </div>
          <Text className="dark:text-gray-400 mt-1">
            Connect Google Calendar or Microsoft Outlook to sync deadlines, meetings, and project milestones.
          </Text>
        </div>

        <Button
          icon={RefreshCw}
          color="blue"
          loading={syncMutation.isPending}
          onClick={() => syncMutation.mutate()}
        >
          Sync Now
        </Button>
      </Flex>

      {syncMessage && (
        <div className="p-4 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-300 rounded-lg flex items-center gap-2 text-sm border border-emerald-200 dark:border-emerald-800">
          <CheckCircle2 className="w-5 h-5 shrink-0" />
          <span>{syncMessage}</span>
        </div>
      )}

      {/* Connected Provider Cards */}
      <Grid numItemsSm={1} numItemsLg={2} className="gap-6">
        <Card className="p-6">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h3 className="font-semibold text-lg text-gray-900 dark:text-white flex items-center gap-2">
                Google Calendar
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Sync project deadlines and task due dates with Google Workspace.
              </p>
            </div>
            <Badge color="emerald">Connected</Badge>
          </div>

          <div className="pt-4 border-t border-gray-100 dark:border-slate-800 flex justify-between items-center">
            <span className="text-xs text-gray-500">Sync Frequency: Real-Time</span>
            <Button
              size="xs"
              variant="secondary"
              loading={connectMutation.isPending}
              onClick={() => connectMutation.mutate('GOOGLE')}
            >
              Reconnect Google
            </Button>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h3 className="font-semibold text-lg text-gray-900 dark:text-white flex items-center gap-2">
                Microsoft Outlook
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Sync tasks and calendar events with Office 365 / Outlook.
              </p>
            </div>
            <Badge color="gray">Not Connected</Badge>
          </div>

          <div className="pt-4 border-t border-gray-100 dark:border-slate-800 flex justify-between items-center">
            <span className="text-xs text-gray-500">OAuth2 Integration Available</span>
            <Button
              size="xs"
              icon={ArrowRight}
              color="blue"
              loading={connectMutation.isPending}
              onClick={() => connectMutation.mutate('OUTLOOK')}
            >
              Connect Outlook
            </Button>
          </div>
        </Card>
      </Grid>

      {/* Sync Status Metrics */}
      <Card className="p-6">
        <Title className="text-base mb-4 dark:text-white">Calendar Sync Status & Active Items</Title>
        <Grid numItemsSm={2} numItemsLg={2} className="gap-4">
          <div className="p-4 bg-gray-50 dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700">
            <span className="text-xs font-medium text-gray-500">Active Task Deadlines Synced</span>
            <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{tasksCount}</p>
          </div>

          <div className="p-4 bg-gray-50 dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700">
            <span className="text-xs font-medium text-gray-500">Project Target Milestones Synced</span>
            <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{projectsCount}</p>
          </div>
        </Grid>
      </Card>
    </div>
  );
};
