import { useMutation } from '@tanstack/react-query';
import { api } from '../../../lib/api';

/*
 * The AI endpoints are asynchronous: they enqueue a BullMQ job and respond
 * HTTP 202 with `{ data: { jobId, status: 'QUEUED', ... } }`. The completed
 * answer arrives later over the `ai.completion.finished` socket event.
 * A previous type here claimed `data` was the final string, which made
 * consumers render the job handle object itself (crashing the chat panel).
 */
export interface AIJobTicket {
  jobId: string;
  status: string;
  message?: string;
  checkStatusUrl?: string;
}

export const useTaskSummary = () => {
  return useMutation({
    mutationFn: async (taskId: string) => {
      const { data } = await api.get<{ data: AIJobTicket }>(`/ai/tasks/${taskId}/summary`);
      return data.data;
    }
  });
};

interface AssistantParams {
  query: string;
  contextType: 'GLOBAL' | 'TASK' | 'PROJECT' | 'CRM';
  entityId?: string;
}

export const useAssistant = () => {
  return useMutation({
    mutationFn: async (params: AssistantParams) => {
      const { data } = await api.post<{ data: AIJobTicket }>('/ai/assistant/ask', params);
      return data.data;
    }
  });
};
