import { Router } from 'express';
import { requireAuth } from '../../core/middlewares/authMiddleware';
import { requirePermission } from '../../core/middlewares/rbacMiddleware';
import { validateRequest } from '../../core/middlewares/validateRequest';
import { asyncWrapper } from '../../core/utils/asyncWrapper';
import { CalendarController } from './calendar.controller';
import {
  connectCalendarSchema,
  disconnectAccountSchema,
  getCalendarFeedSchema,
  listAccountsSchema,
} from './calendar.validator';
import { PERMISSIONS } from '../../core/auth/permissions';

const router = Router();
const controller = new CalendarController();

router.use(requireAuth);

/*
 * FEATURE (ledger #3, 2026-08-05): the OAuth CALLBACK moved to
 * calendar.public.routes.ts (mounted first, same URL) — a provider
 * redirect is browser-delivered without a session bearer, so the route
 * authenticates via the verified HMAC state instead of requireAuth.
 * This authenticated router keeps everything session-scoped.
 */

router.get(
  '/',
  validateRequest(getCalendarFeedSchema),
  asyncWrapper(controller.getCalendarFeed.bind(controller))
);

router.get(
  '/connect',
  requirePermission(PERMISSIONS.SYSTEM.ADMIN),
  validateRequest(connectCalendarSchema),
  asyncWrapper(controller.getConnectUrl.bind(controller))
);

// FEATURE (ledger #3): connected-account reads for the settings UI —
// session-scoped, token material never leaves the repository.
router.get(
  '/accounts',
  validateRequest(listAccountsSchema),
  asyncWrapper(controller.listAccounts.bind(controller))
);

router.delete(
  '/accounts/:provider',
  validateRequest(disconnectAccountSchema),
  asyncWrapper(controller.disconnectAccount.bind(controller))
);

router.post(
  '/sync',
  requirePermission(PERMISSIONS.SYSTEM.ADMIN),
  asyncWrapper(controller.triggerSync.bind(controller))
);

export default router;
