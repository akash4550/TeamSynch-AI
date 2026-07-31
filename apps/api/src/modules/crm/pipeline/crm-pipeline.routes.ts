import { Router } from 'express';
import rateLimit from 'express-rate-limit';

import { PERMISSIONS } from '../../../core/auth/permissions';
import { requireAuth } from '../../../core/middlewares/authMiddleware';
import { requirePermission } from '../../../core/middlewares/rbacMiddleware';
import { validateRequest } from '../../../core/middlewares/validateRequest';
import { asyncWrapper } from '../../../core/utils/asyncWrapper';
import { CRMPipelineController } from './crm-pipeline.controller';
import {
  createPipelineStageSchema,
  moveOpportunitySchema,
} from './crm.validator';

const router = Router();
const controller = new CRMPipelineController();

router.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: 'Too many pipeline requests, please try again later.',
    },
  }),
);
router.use(requireAuth);

router.get(
  '/board',
  requirePermission(PERMISSIONS.CRM.READ),
  asyncWrapper(controller.getPipelineBoard.bind(controller)),
);

router.post(
  '/stages',
  requirePermission(PERMISSIONS.CRM.MANAGE_PIPELINE),
  validateRequest(createPipelineStageSchema),
  asyncWrapper(controller.createStage.bind(controller)),
);

router.patch(
  '/opportunities/:id/move',
  requirePermission(PERMISSIONS.CRM.WRITE),
  validateRequest(moveOpportunitySchema),
  asyncWrapper(controller.moveOpportunity.bind(controller)),
);

export default router;
