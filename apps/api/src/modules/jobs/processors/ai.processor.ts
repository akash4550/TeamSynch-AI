import { Job } from 'bullmq';
import { BaseJobData } from '../services/job.service';
import { AIService } from '../../ai/services/ai.service';
import { ContextBuilder } from '../../ai/context/context.builder';
import { PROMPTS } from '../../ai/prompts';
import { RealtimeService } from '../../realtime/realtime.service';
import { logger } from '../../../core/utils/logger';

export interface AICompletionJobData extends BaseJobData {
  taskType: 'TASK_SUMMARY' | 'WORKSPACE_ASSISTANT' | 'SUMMARIZE_PROJECT';
  contextType?: 'TASK' | 'PROJECT' | 'GLOBAL';
  entityId?: string;
  query?: string;
}

export const aiProcessor = async (job: Job<AICompletionJobData>) => {
  const { organizationId, userId, taskType, contextType, entityId, query } = job.data;

  if (!organizationId || !userId) {
    throw new Error('Tenant context (organizationId, userId) missing in AI job payload');
  }

  const aiService = new AIService();
  const realtimeService = new RealtimeService();

  logger.info(`[AIWorker] Processing job ${job.id} for org ${organizationId}`);

  let promptContext = '';
  let featureTag = 'WORKSPACE_ASSISTANT';

  if (taskType === 'TASK_SUMMARY' && entityId) {
    promptContext = await ContextBuilder.buildTaskContext(organizationId, entityId);
    featureTag = 'TASK_SUMMARY';
  } else if (contextType === 'PROJECT' && entityId) {
    promptContext = await ContextBuilder.buildProjectContext(organizationId, entityId);
    featureTag = 'PROJECT_SUMMARY';
  } else if (contextType === 'TASK' && entityId) {
    promptContext = await ContextBuilder.buildTaskContext(organizationId, entityId);
  } else {
    promptContext = 'General Workspace Context';
  }

  const userPrompt = query
    ? `User Query: ${query}\n\nRelevant Context:\n${promptContext}`
    : `${PROMPTS.FEATURES.TASK_SUMMARY}\n\n${promptContext}`;

  // Execute LLM completion with token/cost tracking inside AIService
  const completionResponse = await aiService.generateCompletion(
    organizationId,
    userId,
    featureTag,
    {
      systemPrompt: PROMPTS.SYSTEM.DEFAULT_ASSISTANT,
      prompt: userPrompt,
    }
  );

  /*
   * BUG FIX (AI answer broadcast tenant-wide): the completion payload — the
   * full AI answer text plus the asker's userId — was emitted to the entire
   * organization room, leaking every user's AI interactions to all tenant
   * sockets. The answer belongs only to the asking user (their socket joins
   * `user:<userId>` at handshake), so emit to the user room instead.
   */
  realtimeService.emitToUser(userId, 'ai.completion.finished', {
    jobId: job.id,
    userId,
    featureTag,
    result: completionResponse.text,
    completedAt: new Date().toISOString(),
  });

  logger.info(`[AIWorker] Completed job ${job.id} for org ${organizationId}. Emitted realtime event.`);

  return {
    success: true,
    jobId: job.id,
    result: completionResponse.text,
  };
};
