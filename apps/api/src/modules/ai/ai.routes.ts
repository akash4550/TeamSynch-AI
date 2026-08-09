import { Router } from 'express';
import rateLimit from 'express-rate-limit';
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

/*
 * AI endpoint rate limiting (ledger #24 — 2026-08-09): every AI route
 * spends REAL provider tokens per request, so the generic API budget
 * (1000 req/15min) is too loose to act as an abuse/cost guard. This
 * dedicated limiter caps each client IP at 300 requests per 15 minutes
 * (~20/min sustained — generous for human chat traffic, including
 * office-NAT sharing, while stopping scripted floods). The per-org
 * entitlement quota (FREE=50/mo, STARTER=500, ...) remains the primary
 * spending gate; this limiter is the network-level backstop. Applied
 * BEFORE auth so unauthenticated floods are throttled too.
 */
export const AI_RATE_LIMIT = {
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many AI requests, please try again later.' },
} as const;

export const createAIRateLimiter = (
  overrides: Partial<Parameters<typeof rateLimit>[0]> = {},
) => rateLimit({ ...AI_RATE_LIMIT, ...overrides });

router.use(createAIRateLimiter());
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
