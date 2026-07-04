import { useState } from 'react';
import { Card, Title, Text, Button, Badge } from '@tremor/react';
import { PlusIcon } from '@heroicons/react/24/outline';
import {
  usePipelineStages,
  useOpportunities,
  useUpdateOpportunity,
  type Opportunity,
  type PipelineStage,
} from './hooks/useCRMQueries';
import { Link } from 'react-router-dom';

export const PipelineBoard = () => {
  const { data: stages, isLoading: isLoadingStages } = usePipelineStages();
  const { data: oppsData, isLoading: isLoadingOpps } = useOpportunities();
  const updateOpportunityMutation = useUpdateOpportunity();

  const [draggedOppId, setDraggedOppId] = useState<string | null>(null);

  const opportunities = oppsData?.data || [];

  const handleDragStart = (oppId: string) => {
    setDraggedOppId(oppId);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (stageId: string) => {
    if (!draggedOppId) return;

    updateOpportunityMutation.mutate({
      id: draggedOppId,
      data: { stageId },
    });

    setDraggedOppId(null);
  };

  return (
    <div className="p-6 h-full overflow-auto bg-gray-50 dark:bg-gray-900 flex flex-col">
      <div className="mb-6 flex justify-between items-center shrink-0">
        <div>
          <Title className="dark:text-white">Pipeline Board</Title>
          <Text className="dark:text-gray-400">Drag and drop deals across stages in your sales pipeline.</Text>
        </div>
        <Link to="/crm/opportunities">
          <Button icon={PlusIcon} color="blue">Manage Opportunities</Button>
        </Link>
      </div>

      <div className="flex-1 flex gap-4 overflow-x-auto pb-4">
        {isLoadingStages || isLoadingOpps ? (
          <div className="text-gray-500 p-6">Loading pipeline...</div>
        ) : !stages || stages.length === 0 ? (
          <div className="text-gray-500 p-6">No pipeline stages defined.</div>
        ) : (
          stages.map((stage: PipelineStage) => {
            const stageDeals = opportunities.filter((o: Opportunity) => o.stageId === stage.id);
            const stageValue = stageDeals.reduce((sum, o) => sum + Number(o.expectedRevenue || 0), 0);

            return (
              <div
                key={stage.id}
                onDragOver={handleDragOver}
                onDrop={() => handleDrop(stage.id)}
                className="w-72 shrink-0 bg-gray-100 dark:bg-gray-800 rounded-lg p-3 flex flex-col border border-gray-200 dark:border-gray-700"
              >
                <div className="flex justify-between items-center mb-3">
                  <h3 className="font-semibold text-gray-900 dark:text-white text-sm">{stage.name}</h3>
                  <Badge color="blue" size="xs">{stageDeals.length}</Badge>
                </div>
                <Text className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                  ${stageValue.toLocaleString()} ({stage.probability}%)
                </Text>

                <div className="flex-1 space-y-3 overflow-y-auto">
                  {stageDeals.map((opp: Opportunity) => (
                    <Card
                      key={opp.id}
                      draggable
                      onDragStart={() => handleDragStart(opp.id)}
                      className="p-3 cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md"
                    >
                      <h4 className="font-medium text-sm text-gray-900 dark:text-white mb-1">
                        {opp.lead?.title || `Deal #${opp.id.slice(0, 6)}`}
                      </h4>
                      <div className="flex justify-between items-center text-xs text-gray-500 dark:text-gray-400 mt-2">
                        <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                          {opp.expectedRevenue ? `$${Number(opp.expectedRevenue).toLocaleString()}` : 'N/A'}
                        </span>
                        <span>{new Date(opp.createdAt).toLocaleDateString()}</span>
                      </div>
                    </Card>
                  ))}
                  {stageDeals.length === 0 && (
                    <div className="h-24 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-md flex items-center justify-center text-xs text-gray-400">
                      Drop deal here
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
