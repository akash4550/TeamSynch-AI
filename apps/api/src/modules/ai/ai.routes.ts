import { Router } from 'express';
import { requireAuth } from '../../core/middlewares/authMiddleware';
import { requirePermission } from '../../core/middlewares/rbacMiddleware';
import { validateRequest } from '../../core/middlewares/validateRequest';
import { requireEntitlement } from '../../core/middlewares/requireEntitlement';
import { asyncWrapper } from '../../core/utils/asyncWrapper';
import { AIController } from './ai.controller';
import { AskAssistantSchema, RagAskSchema, SummarizeTaskSchema } from './ai.dto';
import { PERMISSIONS } from '../../core/auth/permissions';

const router = Router();
const controller = new AIController();

router.use(requireAuth);
router.use(requirePermission(PERMISSIONS.AI.USE));

/*
 * BUG FIX (#49 — AI plan quota never enforced): every endpoint in this
 * module spends AI provider tokens, and both the monthly counter
 * (EntitlementService counts aIUsageLog rows, written by ai.service after
 * each completion — FREE=50/mo, STARTER=500, PRO=5000, BUSINESS=50000)
 * and the SubscriptionSettingsPage usage bar were live — but no route
 * enforced the gate, so any tenant member with AI.USE could spend
 * unlimited tokens regardless of plan. Applying requireEntitlement at the
 * router level also preserves the entitlement module's designed 402
 * lockout for PAST_DUE / CANCELED subscriptions across the whole module.
 */
router.use(requireEntitlement('AI_REQUEST'));

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

// Bug #38: was the ONLY AI route missing validateRequest — see ai.dto.ts.
router.post(
  '/rag/ask',
  validateRequest(RagAskSchema),
  asyncWrapper(controller.askRAGChat.bind(controller))
);

export default router;
