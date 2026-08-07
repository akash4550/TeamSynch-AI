import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../lib/api';

const omitEmptySearch = <T extends { search?: string }>(
  params?: T
): T | undefined => {
  if (!params) return undefined;

  return {
    ...params,
    search: params.search?.trim() || undefined,
  };
};

export interface Client {
  id: string;
  name: string;
  industry?: string;
  website?: string;
  phone?: string;
  email?: string;
  address?: string;
  status: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
  ownerId?: string;
  createdAt: string;
  updatedAt: string;
  contacts?: Contact[];
  activities?: CRMActivity[];
}

export interface Contact {
  id: string;
  clientId: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  designation?: string;
  createdAt: string;
  updatedAt: string;
  client?: Client;
}

export interface Lead {
  id: string;
  title: string;
  source?: string;
  score: number;
  status: 'NEW' | 'CONTACTED' | 'QUALIFIED' | 'UNQUALIFIED' | 'CONVERTED';
  assignedTo?: string;
  expectedValue?: number;
  createdAt: string;
  updatedAt: string;
}

export interface Opportunity {
  id: string;
  leadId: string;
  stageId: string;
  expectedRevenue?: number;
  closeDate?: string;
  probability?: number;
  createdAt: string;
  updatedAt: string;
  lead?: Lead;
  stage?: PipelineStage;
}

export interface PipelineStage {
  id: string;
  name: string;
  probability: number;
  position: number;
  opportunities?: Opportunity[];
}

export interface CRMActivity {
  id: string;
  type: 'CALL' | 'EMAIL' | 'MEETING' | 'NOTE' | 'STATUS_CHANGE';
  description: string;
  clientId?: string;
  leadId?: string;
  opportunityId?: string;
  createdById: string;
  createdAt: string;
}

// Clients
export const useClients = (params?: { search?: string; status?: string; page?: number; limit?: number }) => {
  return useQuery({
    queryKey: ['crm', 'clients', params],
    queryFn: async () => {
      // Response shape corrected: the API returns `{ data, total }` (repository
      // findMany) — the old `{ meta?: any }` type hid the real pagination field.
      const { data } = await api.get<{ data: Client[]; total: number; meta?: any }>('/crm/clients', { params: omitEmptySearch(params) });
      return data;
    },
  });
};

export const useClient = (id: string) => {
  return useQuery({
    queryKey: ['crm', 'client', id],
    queryFn: async () => {
      const { data } = await api.get<{ data: Client }>(`/crm/clients/${id}`);
      return data.data;
    },
    enabled: Boolean(id),
  });
};

export const useCreateClient = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      name: string;
      industry?: string;
      website?: string;
      phone?: string;
      email?: string;
      address?: string;
    }) => {
      const { data } = await api.post<{ data: Client }>('/crm/clients', payload);
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm', 'clients'] });
    },
  });
};

// NOTE (Bug #59 dead-code sweep): `useUpdateClient` was removed — it had
// zero call sites anywhere in the app (verified by repo-wide census). The
// backend PATCH /crm/clients/:id endpoint remains fully available.

// Contacts
export const useContacts = (params?: { search?: string; clientId?: string; page?: number; limit?: number }) => {
  return useQuery({
    queryKey: ['crm', 'contacts', params],
    queryFn: async () => {
      const { data } = await api.get<{ data: Contact[]; total: number; meta?: any }>('/crm/contacts', { params: omitEmptySearch(params) });
      return data;
    },
  });
};

export const useCreateContact = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      clientId: string;
      firstName: string;
      lastName: string;
      email?: string;
      phone?: string;
      designation?: string;
    }) => {
      const { data } = await api.post<{ data: Contact }>('/crm/contacts', payload);
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm', 'contacts'] });
    },
  });
};

// Leads
export const useLeads = (params?: { search?: string; status?: string; page?: number; limit?: number }) => {
  return useQuery({
    queryKey: ['crm', 'leads', params],
    queryFn: async () => {
      const { data } = await api.get<{ data: Lead[]; total: number; meta?: any }>('/crm/leads', { params: omitEmptySearch(params) });
      return data;
    },
  });
};

export const useCreateLead = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      title: string;
      source?: string;
      score?: number;
      expectedValue?: number;
    }) => {
      const { data } = await api.post<{ data: Lead }>('/crm/leads', payload);
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm', 'leads'] });
    },
  });
};

// NOTE (Bug #59 dead-code sweep): `useUpdateLead` was removed — it had
// zero call sites anywhere in the app (verified by repo-wide census). The
// backend PATCH /crm/leads/:id endpoint remains fully available.

// Opportunities
export const useOpportunities = (params?: { search?: string; stageId?: string; page?: number; limit?: number }) => {
  return useQuery({
    queryKey: ['crm', 'opportunities', params],
    queryFn: async () => {
      const { data } = await api.get<{ data: Opportunity[]; total: number; meta?: any }>('/crm/opportunities', { params: omitEmptySearch(params) });
      return data;
    },
  });
};

export const useCreateOpportunity = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      leadId: string;
      stageId: string;
      expectedRevenue?: number;
      closeDate?: string;
      probability?: number;
    }) => {
      const { data } = await api.post<{ data: Opportunity }>('/crm/opportunities', payload);
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm', 'opportunities'] });
    },
  });
};

export const useUpdateOpportunity = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Opportunity> }) => {
      const res = await api.patch<{ data: Opportunity }>(`/crm/opportunities/${id}`, data);
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm', 'opportunities'] });
    },
  });
};

// Pipeline Stages
export const usePipelineStages = () => {
  return useQuery({
    queryKey: ['crm', 'pipeline-stages'],
    queryFn: async () => {
      const { data } = await api.get<{ data: PipelineStage[] }>('/crm/pipeline-stages');
      return data.data;
    },
  });
};

// Activities
export const useActivities = (params?: { clientId?: string; leadId?: string; opportunityId?: string }) => {
  return useQuery({
    queryKey: ['crm', 'activities', params],
    queryFn: async () => {
      const { data } = await api.get<{ data: CRMActivity[] }>('/crm/activities', { params });
      return data.data;
    },
  });
};

export const useCreateActivity = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      type: 'CALL' | 'EMAIL' | 'MEETING' | 'NOTE' | 'STATUS_CHANGE';
      content: string;
      clientId?: string;
      leadId?: string;
      opportunityId?: string;
    }) => {
      const { data } = await api.post<{ data: CRMActivity }>('/crm/activities', payload);
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm', 'activities'] });
    },
  });
};
