import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../../core/api/client';

export interface PipelineOpportunity {
  id: string;
  leadId: string;
  stageId: string;
  expectedRevenue?: number;
  probability?: number;
  createdAt: string;
  updatedAt: string;
  lead?: {
    id: string;
    title: string;
    status: string;
    source?: string;
  };
}

export interface PipelineStageBoardColumn {
  id: string;
  name: string;
  probability: number;
  position: number;
  metrics: {
    opportunityCount: number;
    totalRevenue: number;
    weightedForecastValue: number;
  };
  opportunities: PipelineOpportunity[];
}

export const PIPELINE_BOARD_QUERY_KEY = ['crm', 'pipeline', 'board'];

export const usePipelineBoard = () => {
  return useQuery({
    queryKey: PIPELINE_BOARD_QUERY_KEY,
    queryFn: async () => {
      const { data } = await apiClient.get<{ data: PipelineStageBoardColumn[] }>(
        '/crm/pipeline-stages/board'
      );
      return data.data;
    },
  });
};

export interface MoveOpportunityParams {
  opportunityId: string;
  targetStageId: string;
  newPosition?: number;
}

export const useMoveOpportunity = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ opportunityId, targetStageId, newPosition }: MoveOpportunityParams) => {
      const { data } = await apiClient.patch(
        `/crm/pipeline-stages/opportunities/${opportunityId}/move`,
        { targetStageId, newPosition }
      );
      return data.data;
    },

    // Optimistic UI Update Before Server Response
    onMutate: async ({ opportunityId, targetStageId }: MoveOpportunityParams) => {
      // 1. Cancel ongoing refetches to prevent overwriting optimistic state
      await queryClient.cancelQueries({ queryKey: PIPELINE_BOARD_QUERY_KEY });

      // 2. Snapshot previous cache state for rollback
      const previousBoard = queryClient.getQueryData<PipelineStageBoardColumn[]>(PIPELINE_BOARD_QUERY_KEY);

      // 3. Optimistically update query cache
      if (previousBoard) {
        let movedOpportunity: PipelineOpportunity | undefined;

        // Locate and extract opportunity from source stage
        const updatedBoard = previousBoard.map((stage) => {
          const found = stage.opportunities.find((o) => o.id === opportunityId);
          if (found) {
            movedOpportunity = { ...found, stageId: targetStageId };
            return {
              ...stage,
              opportunities: stage.opportunities.filter((o) => o.id !== opportunityId),
            };
          }
          return stage;
        });

        // Insert opportunity into target stage
        if (movedOpportunity) {
          const finalBoard = updatedBoard.map((stage) => {
            if (stage.id === targetStageId) {
              return {
                ...stage,
                opportunities: [movedOpportunity!, ...stage.opportunities],
              };
            }
            return stage;
          });

          queryClient.setQueryData(PIPELINE_BOARD_QUERY_KEY, finalBoard);
        }
      }

      // Return context for error rollback
      return { previousBoard };
    },

    // Rollback cache on error
    onError: (_error, _variables, context) => {
      if (context?.previousBoard) {
        queryClient.setQueryData(PIPELINE_BOARD_QUERY_KEY, context.previousBoard);
      }
    },

    // Invalidate cache on settled to sync authoritative state
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: PIPELINE_BOARD_QUERY_KEY });
    },
  });
};
