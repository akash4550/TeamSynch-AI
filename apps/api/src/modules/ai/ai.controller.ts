import { Request, Response } from 'express';
import { getValidatedRequest } from '../../core/middlewares/validateRequest';
import { AskAssistantRequest, RagAskRequest, SummarizeTaskRequest } from './ai.dto';
import { aiQueue } from '../jobs/queues';
import { RAGService } from './services/rag.service';
import { ContextBuilder } from './context/context.builder';

const ragService = new RAGService();

export class AIController {
  async summarizeTask(req: Request, res: Response): Promise<void> {
    const { params } = getValidatedRequest<SummarizeTaskRequest>(req);
    const organizationId = req.user!.organizationId;
    const userId = req.user!.id;

    await ContextBuilder.buildTaskContext(organizationId, params.taskId);

    const job = await aiQueue.add('AI_GENERATE_COMPLETION', {
      organizationId,
      userId,
      taskType: 'TASK_SUMMARY',
      entityId: params.taskId,
    });

    res.status(202).json({
      data: {
        jobId: job.id,
        status: 'QUEUED',
        message: 'AI task summary generation queued asynchronously.',
        checkStatusUrl: `/api/v1/jobs/${job.id}`,
      },
    });
  }

  async askAssistant(req: Request, res: Response): Promise<void> {
    const { body } = getValidatedRequest<AskAssistantRequest>(req);
    const organizationId = req.user!.organizationId;
    const userId = req.user!.id;

    if (body.contextType === 'TASK' && body.entityId) {
      await ContextBuilder.buildTaskContext(organizationId, body.entityId);
    } else if (body.contextType === 'PROJECT' && body.entityId) {
      await ContextBuilder.buildProjectContext(organizationId, body.entityId);
    }

    const job = await aiQueue.add('AI_GENERATE_COMPLETION', {
      organizationId,
      userId,
      taskType: 'WORKSPACE_ASSISTANT',
      contextType: body.contextType,
      entityId: body.entityId,
      query: body.query,
    });

    res.status(202).json({
      data: {
        jobId: job.id,
        status: 'QUEUED',
        message: 'AI completion generation queued asynchronously.',
        checkStatusUrl: `/api/v1/jobs/${job.id}`,
      },
    });
  }

  async askRAGChat(req: Request, res: Response): Promise<void> {
    /*
     * BUG FIX (unvalidated `req.body.query` — Bug #38): read through the
     * SAME getValidatedRequest<T> contract the sibling handlers use, so a
     * missing/non-string/oversized `query` is rejected with a 400
     * "Validation failed: ..." at the door instead of crashing the
     * embedding pipeline into a 500 (or silently burning provider tokens).
     */
    const { body } = getValidatedRequest<RagAskRequest>(req);
    const { query } = body;
    const organizationId = req.user!.organizationId;
    const userId = req.user!.id;

    const ragResponse = await ragService.askRAGQuestion(organizationId, userId, query);
    res.json({ data: ragResponse });
  }
}
