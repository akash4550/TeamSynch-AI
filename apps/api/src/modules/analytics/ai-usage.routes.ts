import { Router } from 'express';

import { AIUsageController } from './ai-usage.controller';
import { GetAIUsageSchema } from './ai-usage.dto';
import { requireAuth } from '../../core/middlewares/authMiddleware';
import { requirePermission } from '../../core/middlewares/rbacMiddleware';
import { validateRequest } from '../../core/middlewares/validateRequest';
import { PERMISSIONS } from '../../core/auth/permissions';

const router = Router();
const controller = new AIUsageController();

router.use(requireAuth);

router.get(
  '/ai-usage',
  requirePermission(PERMISSIONS.ANALYTICS.VIEW),
  validateRequest(GetAIUsageSchema),
  controller.getAIUsage.bind(controller),
);

export default router;
