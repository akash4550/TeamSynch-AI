import { Router } from 'express';
import { BillingController } from './billing.controller';
import { requireAuth } from '../../core/middlewares/authMiddleware';
import { requirePermission } from '../../core/middlewares/rbacMiddleware';
import { asyncWrapper } from '../../core/utils/asyncWrapper';
import { PERMISSIONS } from '../../core/auth/permissions';

const router = Router();
const controller = new BillingController();

// Unauthenticated Webhook Route for Stripe Signature Verification
router.post(
  '/webhook',
  asyncWrapper(controller.handleWebhook.bind(controller))
);

// Authenticated Subscription & Billing Routes
router.use(requireAuth);

router.get(
  '/subscription',
  requirePermission(PERMISSIONS.BILLING.MANAGE),
  asyncWrapper(controller.getSubscription.bind(controller))
);

router.post(
  '/checkout',
  requirePermission(PERMISSIONS.BILLING.MANAGE),
  asyncWrapper(controller.createCheckoutSession.bind(controller))
);

router.post(
  '/portal',
  requirePermission(PERMISSIONS.BILLING.MANAGE),
  asyncWrapper(controller.createPortalSession.bind(controller))
);

export default router;
