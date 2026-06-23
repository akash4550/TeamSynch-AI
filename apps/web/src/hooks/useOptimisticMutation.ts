import { useMutation, useQueryClient, QueryKey } from '@tanstack/react-query';

export interface OptimisticMutationOptions<TData, TVariables, TCache> {
  queryKey: QueryKey;
  mutationFn: (variables: TVariables) => Promise<TData>;
  updateCache: (oldCache: TCache | undefined, variables: TVariables) => TCache;
  onSuccessMessage?: string;
}

/**
 * Reusable Optimistic Mutation Hook:
 * Performs immediate UI cache updates before server confirmation, with automatic rollback if mutation fails.
 */
export function useOptimisticMutation<TData = any, TVariables = any, TCache = any>({
  queryKey,
  mutationFn,
  updateCache,
}: OptimisticMutationOptions<TData, TVariables, TCache>) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn,

    // Optimistic UI Update Before Server Request
    onMutate: async (variables: TVariables) => {
      // 1. Cancel ongoing refetches to prevent overwriting optimistic state
      await queryClient.cancelQueries({ queryKey });

      // 2. Snapshot previous cache for error rollback
      const previousData = queryClient.getQueryData<TCache>(queryKey);

      // 3. Optimistically update query cache
      if (previousData !== undefined) {
        queryClient.setQueryData<TCache>(queryKey, (old) => updateCache(old, variables));
      }

      return { previousData };
    },

    // Rollback cache on mutation failure
    onError: (_error, _variables, context) => {
      if (context?.previousData !== undefined) {
        queryClient.setQueryData(queryKey, context.previousData);
      }
    },

    // Invalidate and sync with authoritative backend state upon settlement
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });
}
