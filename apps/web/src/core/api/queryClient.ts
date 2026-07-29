import { QueryClient } from '@tanstack/react-query';

/**
 * Production-Tuned TanStack Query Client Configuration:
 * - staleTime: 5 minutes (prevents aggressive redundant network refetches)
 * - gcTime: 10 minutes (garbage collects inactive query cache entries)
 * - refetchOnWindowFocus: false (avoids refetch storms when switching browser tabs)
 * - retry: Exponential backoff up to 3 attempts (skips 401/403/404 errors)
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 10 * 60 * 1000, // 10 minutes
      refetchOnWindowFocus: false,
      refetchOnReconnect: 'always',
      retry: (failureCount, error: any) => {
        // Do not retry on 401 Unauthorized, 403 Forbidden, or 404 Not Found
        const status = error?.response?.status;
        if (status === 401 || status === 403 || status === 404) {
          return false;
        }
        return failureCount < 3;
      },
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    },
    mutations: {
      retry: false,
    },
  },
});
