import { Router } from 'express';
import { requireAuth } from '../../core/middlewares/authMiddleware';
import { requirePermission } from '../../core/middlewares/rbacMiddleware';
import { validateRequest } from '../../core/middlewares/validateRequest';
import { asyncWrapper } from '../../core/utils/asyncWrapper';
import { CalendarController } from './calendar.controller';
import {
  getCalendarFeedSchema,
} from './calendar.validator';
import { PERMISSIONS } from '../../core/auth/permissions';

const router = Router();
const controller = new CalendarController();

router.use(requireAuth);

router.get(
  '/',
  validateRequest(getCalendarFeedSchema),
  asyncWrapper(controller.getCalendarFeed.bind(controller))
);

router.get(
  '/connect',
  requirePermission(PERMISSIONS.SYSTEM.ADMIN),
  asyncWrapper(controller.getConnectUrl.bind(controller))
);

router.get(
  '/callback/:provider',
  requirePermission(PERMISSIONS.SYSTEM.ADMIN),
  asyncWrapper(controller.handleCallback.bind(controller))
);

router.post(
  '/sync',
  requirePermission(PERMISSIONS.SYSTEM.ADMIN),
  asyncWrapper(controller.triggerSync.bind(controller))
);

export default router;
