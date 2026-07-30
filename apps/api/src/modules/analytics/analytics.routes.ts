import { Router } from 'express';
import { AnalyticsController } from './analytics.controller';
import { requireAuth } from '../../core/middlewares/authMiddleware';
import { requirePermission } from '../../core/middlewares/rbacMiddleware';
import { PERMISSIONS } from '../../core/auth/permissions';
import { validateRequest } from '../../core/middlewares/validateRequest';
import { GetMetricSchema, GetReportSchema } from './analytics.dto';

const router = Router();
const controller = new AnalyticsController();

router.use(requireAuth);

router.get(
  '/reports/:reportType',
  requirePermission(PERMISSIONS.ANALYTICS.VIEW),
  validateRequest(GetReportSchema),
  controller.getReport.bind(controller)
);

router.get(
  '/metrics/:metricName',
  requirePermission(PERMISSIONS.ANALYTICS.VIEW),
  validateRequest(GetMetricSchema),
  controller.getMetric.bind(controller)
);

export default router;
