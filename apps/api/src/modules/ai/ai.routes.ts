import { Router } from 'express';
import { requireAuth } from '../../core/middlewares/authMiddleware';
import { requirePermission } from '../../core/middlewares/rbacMiddleware';
import { validateRequest } from '../../core/middlewares/validateRequest';
import { asyncWrapper } from '../../core/utils/asyncWrapper';
import { AIController } from './ai.controller';
import { AskAssistantSchema, SummarizeTaskSchema } from './ai.dto';
import { PERMISSIONS } from '../../core/auth/permissions';

const router = Router();
const controller = new AIController();

router.use(requireAuth);
router.use(requirePermission(PERMISSIONS.AI.USE));

router.get(
  '/tasks/:taskId/summary',
  validateRequest(SummarizeTaskSchema),
  asyncWrapper(controller.summarizeTask.bind(controller))
);

router.post(
  '/assistant/ask',
  validateRequest(AskAssistantSchema),
  asyncWrapper(controller.askAssistant.bind(controller))
);

router.post(
  '/rag/ask',
  asyncWrapper(controller.askRAGChat.bind(controller))
);

export default router;
