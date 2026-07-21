import { Job } from 'bullmq';
import { BaseJobData } from '../services/job.service';
import { validateTenantJobData } from '../queues';
import { VectorService } from '../../ai/services/vector.service';
import { RealtimeService } from '../../realtime/realtime.service';
import { logger } from '../../../core/utils/logger';

export interface EmbeddingJobData extends BaseJobData {
  documentId?: string;
  taskId?: string;
  projectId?: string;
  content: string;
}

export const embeddingProcessor = async (job: Job<EmbeddingJobData>) => {
  const data = validateTenantJobData(job.data);
  const { organizationId, userId, documentId, taskId, projectId, content } = data;

  const vectorService = new VectorService();
  const realtimeService = new RealtimeService();

  logger.info(`[EmbeddingWorker] Processing text vector embedding for org ${organizationId}`);

  // 1. Split document text into semantic chunks
  const chunks = vectorService.chunkText(content, 1000, 200);

  // 2. Generate and store vector embeddings for each chunk
  for (const chunk of chunks) {
    await vectorService.storeVectorChunk({
      organizationId,
      documentId,
      taskId,
      projectId,
      contentChunk: chunk,
    });
  }

  // 3. Emit realtime event to tenant room
  realtimeService.emitToOrganization(organizationId, 'ai.embedding.completed', {
    jobId: job.id,
    userId,
    documentId,
    totalChunks: chunks.length,
    timestamp: new Date().toISOString(),
  });

  logger.info(`[EmbeddingWorker] Vector indexing complete. Generated ${chunks.length} embedding chunks.`);

  return {
    success: true,
    totalChunks: chunks.length,
  };
};
