import { useQuery, useMutation } from '@tanstack/react-query';
import { apiClient } from '../../../core/api/client';

export interface AuditLogUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  avatar?: string;
}

export interface AuditLogRecord {
  id: string;
  organizationId: string;
  userId?: string;
  type: string;
  entityType: string;
  entityId: string;
  metadata?: any;
  ipAddress?: string;
  userAgent?: string;
  createdAt: string;
  updatedAt: string;
  user?: AuditLogUser;
}

export interface AuditLogCursorResult {
  data: AuditLogRecord[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface AuditLogQueryParams {
  cursor?: string;
  limit?: number;
  userId?: string;
  type?: string;
  entityType?: string;
  startDate?: string;
  endDate?: string;
}

export const AUDIT_LOGS_QUERY_KEY = ['audit', 'logs'];

export const useAuditLogs = (params?: AuditLogQueryParams) => {
  return useQuery({
    queryKey: [...AUDIT_LOGS_QUERY_KEY, params],
    queryFn: async () => {
      const { data } = await apiClient.get<{ data: AuditLogCursorResult }>('/audit/logs', {
        params,
      });
      return data.data;
    },
  });
};

export const useTriggerComplianceExport = () => {
  return useMutation({
    mutationFn: async (payload: { format: 'CSV' | 'JSON'; entityType?: string }) => {
      const { data } = await apiClient.post<{ data: { jobId: string; status: string; checkStatusUrl: string } }>(
        '/audit/export',
        payload
      );
      return data.data;
    },
  });
};
