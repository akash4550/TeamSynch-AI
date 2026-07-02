import { Router } from 'express';
import { CRMPipelineController } from './crm-pipeline.controller';
import { requireAuth } from '../../../core/middlewares/authMiddleware';
import { requirePermission } from '../../../core/middlewares/rbacMiddleware';
import { validateRequest } from '../../../core/middlewares/validateRequest';
import { asyncWrapper } from '../../../core/utils/asyncWrapper';
import { PERMISSIONS } from '../../../core/auth/permissions';
import {
  createPipelineStageSchema,
  moveOpportunitySchema,
} from './crm.validator';

const router = Router();
const controller = new CRMPipelineController();

router.use(requireAuth);

router.get(
  '/board',
  requirePermission(PERMISSIONS.CRM.READ),
  asyncWrapper(controller.getPipelineBoard.bind(controller))
);

router.post(
  '/stages',
  requirePermission(PERMISSIONS.CRM.MANAGE_PIPELINE),
  validateRequest(createPipelineStageSchema),
  asyncWrapper(controller.createStage.bind(controller))
);

router.patch(
  '/opportunities/:id/move',
  requirePermission(PERMISSIONS.CRM.WRITE),
  validateRequest(moveOpportunitySchema),
  asyncWrapper(controller.moveOpportunity.bind(controller))
);

export default router;
