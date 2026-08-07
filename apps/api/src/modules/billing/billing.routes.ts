import { Router } from 'express';
import { BillingController } from './billing.controller';
import { requireAuth } from '../../core/middlewares/authMiddleware';
import { requirePermission } from '../../core/middlewares/rbacMiddleware';
import { validateRequest } from '../../core/middlewares/validateRequest';
import { asyncWrapper } from '../../core/utils/asyncWrapper';
import { BillingCheckoutSchema, BillingPortalSchema } from './billing.dto';
import { PERMISSIONS } from '../../core/auth/permissions';

const router = Router();
const controller = new BillingController();

/*
 * FEATURE CLEANUP (ledger #10 — 2026-08-05): the duplicate webhook route
 * that used to live here is DELETED. app.ts mounts the live handler
 * directly at POST /api/v1/billing/webhook with `express.raw()` BEFORE the
 * JSON parser; this router mounts under the same prefix but AFTER
 * express.json, so the route below was (a) permanently shadowed by the
 * app.ts registration and (b) guaranteed-broken if it ever ran — a parsed
 * body can never pass HMAC signature verification. One webhook route now
 * exists; Stripe's endpoint configuration points at it.
 */;

// Authenticated Subscription & Billing Routes
router.use(requireAuth);

router.get(
  '/subscription',
  requirePermission(PERMISSIONS.BILLING.MANAGE),
  asyncWrapper(controller.getSubscription.bind(controller))
);

// Bug #43: both body-reading billing routes were unvalidated — see billing.dto.ts.
// The /webhook route above intentionally stays validateRequest-free (raw HMAC verify).
router.post(
  '/checkout',
  requirePermission(PERMISSIONS.BILLING.MANAGE),
  validateRequest(BillingCheckoutSchema),
  asyncWrapper(controller.createCheckoutSession.bind(controller))
);

router.post(
  '/portal',
  requirePermission(PERMISSIONS.BILLING.MANAGE),
  validateRequest(BillingPortalSchema),
  asyncWrapper(controller.createPortalSession.bind(controller))
);

export default router;
