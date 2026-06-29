import { useState } from 'react';
import { Card, Title, Text, Table, TableHead, TableHeaderCell, TableBody, TableRow, TableCell, Button, Flex } from '@tremor/react';
import { PlusIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import {
  useOpportunities,
  useCreateOpportunity,
  useLeads,
  usePipelineStages,
  type Opportunity,
} from './hooks/useCRMQueries';

export const OpportunitiesPage = () => {
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Form State
  const [leadId, setLeadId] = useState('');
  const [stageId, setStageId] = useState('');
  const [expectedRevenue, setExpectedRevenue] = useState<number | undefined>();
  const [probability, setProbability] = useState<number>(50);

  const { data: oppsData, isLoading } = useOpportunities({ search });
  const { data: leadsData } = useLeads({ limit: 100 });
  const { data: stages } = usePipelineStages();
  const createOpportunityMutation = useCreateOpportunity();

  const opportunities = oppsData?.data || [];
  const leads = leadsData?.data || [];

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!leadId || !stageId) return;

    createOpportunityMutation.mutate(
      { leadId, stageId, expectedRevenue, probability },
      {
        onSuccess: () => {
          setIsModalOpen(false);
          setLeadId('');
          setStageId('');
          setExpectedRevenue(undefined);
          setProbability(50);
        },
      }
    );
  };

  return (
    <div className="p-6 h-full overflow-auto bg-gray-50 dark:bg-gray-900">
      <Flex className="mb-6">
        <div>
          <Title className="dark:text-white">Opportunities</Title>
          <Text className="dark:text-gray-400">Manage active sales deals in your pipeline.</Text>
        </div>
        <Button icon={PlusIcon} color="blue" onClick={() => setIsModalOpen(true)}>Add Opportunity</Button>
      </Flex>

      <div className="mb-6 max-w-sm relative">
        <input
          type="text"
          placeholder="Search opportunities..."
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
              <TableHeaderCell>Opportunity / Lead Title</TableHeaderCell>
              <TableHeaderCell>Pipeline Stage</TableHeaderCell>
              <TableHeaderCell>Probability</TableHeaderCell>
              <TableHeaderCell>Expected Revenue</TableHeaderCell>
              <TableHeaderCell>Created Date</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-6 text-gray-500">
                  Loading opportunities...
                </TableCell>
              </TableRow>
            ) : opportunities.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-6 text-gray-500">
                  No opportunities found. Click "Add Opportunity" to create one.
                </TableCell>
              </TableRow>
            ) : (
              opportunities.map((opp: Opportunity) => (
                <TableRow key={opp.id}>
                  <TableCell className="font-medium text-gray-900 dark:text-gray-100">
                    {opp.lead?.title || `Deal #${opp.id.slice(0, 6)}`}
                  </TableCell>
                  <TableCell>{opp.stage?.name || '-'}</TableCell>
                  <TableCell>{opp.probability ?? opp.stage?.probability ?? 0}%</TableCell>
                  <TableCell>
                    {opp.expectedRevenue ? `$${Number(opp.expectedRevenue).toLocaleString()}` : '-'}
                  </TableCell>
                  <TableCell>{new Date(opp.createdAt).toLocaleDateString()}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Add Opportunity Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg max-w-md w-full p-6 shadow-xl border border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Add Opportunity</h3>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Select Lead *</label>
                <select
                  required
                  value={leadId}
                  onChange={(e) => setLeadId(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white text-sm"
                >
                  <option value="">Select Lead...</option>
                  {leads.map((lead) => (
                    <option key={lead.id} value={lead.id}>{lead.title}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Pipeline Stage *</label>
                <select
                  required
                  value={stageId}
                  onChange={(e) => setStageId(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white text-sm"
                >
                  <option value="">Select Stage...</option>
                  {stages?.map((stage) => (
                    <option key={stage.id} value={stage.id}>{stage.name} ({stage.probability}%)</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Expected Revenue ($)</label>
                <input
                  type="number"
                  min="0"
                  value={expectedRevenue || ''}
                  onChange={(e) => setExpectedRevenue(e.target.value ? Number(e.target.value) : undefined)}
                  className="w-full px-3 py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white text-sm"
                  placeholder="50000"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Win Probability (%)</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={probability}
                  onChange={(e) => setProbability(Number(e.target.value))}
                  className="w-full px-3 py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white text-sm"
                />
              </div>
              <div className="flex justify-end space-x-2 pt-4 border-t border-gray-100 dark:border-gray-700">
                <Button type="button" variant="secondary" onClick={() => setIsModalOpen(false)}>Cancel</Button>
                <Button type="submit" loading={createOpportunityMutation.isPending}>Save Deal</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
