import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../../core/api/client';

export interface PlanQuotas {
  maxUsers: number;
  maxProjects: number;
  maxStorageMb: number;
  maxAiRequestsPerMonth: number;
}

export interface SubscriptionUsageData {
  plan: string;
  subscriptionStatus: string;
  quotas: PlanQuotas;
  // FEATURE (ledger #11): operator-configured Stripe price ids per tier,
  // served by the API. Buttons render from this; null means the tier is not
  // configured on this deployment (button disables honestly — replacing
  // the previous hardcoded fictional ids like 'price_pro_monthly').
  plans?: Array<{ tier: 'STARTER' | 'PRO' | 'BUSINESS'; priceId: string | null }>;
  usage: {
    users: { current: number; max: number; percentage: number };
    projects: { current: number; max: number; percentage: number };
    aiRequests: { current: number; max: number; percentage: number };
    storageMb: { current: number; max: number; percentage: number };
  };
}

export const BILLING_SUBSCRIPTION_QUERY_KEY = ['billing', 'subscription'];

export const useSubscriptionUsage = () => {
  return useQuery({
    queryKey: BILLING_SUBSCRIPTION_QUERY_KEY,
    queryFn: async () => {
      const { data } = await apiClient.get<{ data: SubscriptionUsageData }>('/billing/subscription');
      return data.data;
    },
  });
};

export const useCreateCheckoutSession = () => {
  return useMutation({
    mutationFn: async ({ priceId }: { priceId: string }) => {
      const { data } = await apiClient.post<{ data: { checkoutUrl: string } }>('/billing/checkout', {
        priceId,
      });
      return data.data;
    },
    onSuccess: (data) => {
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      }
    },
  });
};

export const useCreatePortalSession = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { data } = await apiClient.post<{ data: { portalUrl: string } }>('/billing/portal', {});
      return data.data;
    },
    onSuccess: (data) => {
      if (data.portalUrl) {
        window.location.href = data.portalUrl;
      }
      queryClient.invalidateQueries({ queryKey: BILLING_SUBSCRIPTION_QUERY_KEY });
    },
  });
};
