import { Router } from 'express';
import { AuditController } from './audit.controller';
import { requireAuth } from '../../core/middlewares/authMiddleware';
import { requirePermission } from '../../core/middlewares/rbacMiddleware';
import { validateRequest } from '../../core/middlewares/validateRequest';
import { asyncWrapper } from '../../core/utils/asyncWrapper';
import { PERMISSIONS } from '../../core/auth/permissions';
import { exportAuditLogsSchema, getAuditLogsSchema } from './audit.validator';

const router = Router();
const controller = new AuditController();

router.use(requireAuth);

router.get(
  '/logs',
  requirePermission(PERMISSIONS.SYSTEM.ADMIN),
  validateRequest(getAuditLogsSchema),
  asyncWrapper(controller.getAuditLogs.bind(controller))
);

router.post(
  '/export',
  requirePermission(PERMISSIONS.SYSTEM.ADMIN),
  validateRequest(exportAuditLogsSchema),
  asyncWrapper(controller.triggerComplianceExport.bind(controller))
);

export default router;
