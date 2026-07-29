import { Router } from 'express';
import { requireAuth } from '../../core/middlewares/authMiddleware';
import { validateRequest } from '../../core/middlewares/validateRequest';
import { asyncWrapper } from '../../core/utils/asyncWrapper';
import { NotificationController } from './notification.controller';
import {
  getNotificationsSchema,
  markAllReadSchema,
  markReadSchema,
} from './notification.validator';

const router = Router();
const controller = new NotificationController();

router.use(requireAuth);

router.get(
  '/',
  validateRequest(getNotificationsSchema),
  asyncWrapper(controller.getNotifications.bind(controller)),
);

router.patch(
  '/:id/read',
  validateRequest(markReadSchema),
  asyncWrapper(controller.markAsRead.bind(controller)),
);

router.patch(
  '/read-all',
  validateRequest(markAllReadSchema),
  asyncWrapper(controller.markAllAsRead.bind(controller)),
);

export default router;
