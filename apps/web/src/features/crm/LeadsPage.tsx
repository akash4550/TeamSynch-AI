import { useState } from 'react';
import { Card, Title, Text, Table, TableHead, TableHeaderCell, TableBody, TableRow, TableCell, Badge, Button, Flex } from '@tremor/react';
import { PlusIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { useLeads, useCreateLead, type Lead } from './hooks/useCRMQueries';

export const LeadsPage = () => {
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Form State
  const [title, setTitle] = useState('');
  const [source, setSource] = useState('');
  const [score, setScore] = useState(50);
  const [expectedValue, setExpectedValue] = useState<number | undefined>();

  const { data, isLoading } = useLeads({ search });
  const createLeadMutation = useCreateLead();

  const leads = data?.data || [];

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    createLeadMutation.mutate(
      { title, source, score, expectedValue },
      {
        onSuccess: () => {
          setIsModalOpen(false);
          setTitle('');
          setSource('');
          setScore(50);
          setExpectedValue(undefined);
        },
      }
    );
  };

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case 'NEW': return 'blue';
      case 'CONTACTED': return 'amber';
      case 'QUALIFIED': return 'emerald';
      case 'CONVERTED': return 'indigo';
      default: return 'gray';
    }
  };

  return (
    <div className="p-6 h-full overflow-auto bg-gray-50 dark:bg-gray-900">
      <Flex className="mb-6">
        <div>
          <Title className="dark:text-white">Leads</Title>
          <Text className="dark:text-gray-400">Track and qualify inbound sales prospects.</Text>
        </div>
        <Button icon={PlusIcon} color="blue" onClick={() => setIsModalOpen(true)}>Add Lead</Button>
      </Flex>

      <div className="mb-6 max-w-sm relative">
        <input
          type="text"
          placeholder="Search leads..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-700 dark:bg-gray-800 rounded-md text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <MagnifyingGlassIcon className="w-5 h-5 absolute left-3 top-2.5 text-gray-400" />
      </div>

      <Card>
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>Title / Prospect</TableHeaderCell>
              <TableHeaderCell>Source</TableHeaderCell>
              <TableHeaderCell>Lead Score</TableHeaderCell>
              <TableHeaderCell>Expected Value</TableHeaderCell>
              <TableHeaderCell>Status</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-6 text-gray-500">
                  Loading leads...
                </TableCell>
              </TableRow>
            ) : leads.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-6 text-gray-500">
                  No leads found. Click "Add Lead" to create one.
                </TableCell>
              </TableRow>
            ) : (
              leads.map((lead: Lead) => (
                <TableRow key={lead.id}>
                  <TableCell className="font-medium text-gray-900 dark:text-gray-100">{lead.title}</TableCell>
                  <TableCell>{lead.source || '-'}</TableCell>
                  <TableCell>{lead.score} / 100</TableCell>
                  <TableCell>
                    {lead.expectedValue ? `$${Number(lead.expectedValue).toLocaleString()}` : '-'}
                  </TableCell>
                  <TableCell>
                    <Badge color={getStatusBadgeColor(lead.status)}>{lead.status}</Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Add Lead Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg max-w-md w-full p-6 shadow-xl border border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Add New Lead</h3>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Lead Title / Subject *</label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white text-sm"
                  placeholder="Website Redesign Prospect - Globex"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Lead Source</label>
                <input
                  type="text"
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white text-sm"
                  placeholder="Inbound Form / LinkedIn / Cold Outreach"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Score (0-100)</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={score}
                  onChange={(e) => setScore(Number(e.target.value))}
                  className="w-full px-3 py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Expected Value ($)</label>
                <input
                  type="number"
                  min="0"
                  value={expectedValue || ''}
                  onChange={(e) => setExpectedValue(e.target.value ? Number(e.target.value) : undefined)}
                  className="w-full px-3 py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white text-sm"
                  placeholder="25000"
                />
              </div>
              <div className="flex justify-end space-x-2 pt-4 border-t border-gray-100 dark:border-gray-700">
                <Button type="button" variant="secondary" onClick={() => setIsModalOpen(false)}>Cancel</Button>
                <Button type="submit" loading={createLeadMutation.isPending}>Save Lead</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
