import { Request, Response } from 'express';
import { AppError } from '../../core/errors/AppError';
import { getValidatedRequest } from '../../core/middlewares/validateRequest';
import { BillingCheckoutRequest, BillingPortalRequest } from './billing.dto';
import { EntitlementService } from './entitlement.service';
import { StripeBillingService } from './stripe.service';

const entitlementService = new EntitlementService();
const stripeService = new StripeBillingService();

export class BillingController {
  async getSubscription(req: Request, res: Response) {
    const subscription = await entitlementService.getSubscriptionUsage(
      req.user!.organizationId
    );
    res.json({ data: subscription });
  }

  // Bug #43: body now arrives validated by BillingCheckoutSchema (see billing.dto.ts)
  async createCheckoutSession(req: Request, res: Response) {
    const {
      body: { priceId, successUrl, cancelUrl },
    } = getValidatedRequest<BillingCheckoutRequest>(req);
    const session = await stripeService.createCheckoutSession({
      organizationId: req.user!.organizationId,
      userId: req.user!.id,
      priceId,
      successUrl: successUrl || `${req.headers.origin}/settings`,
      cancelUrl: cancelUrl || `${req.headers.origin}/settings`,
    });
    res.json({ data: session });
  }

  // Bug #43: body now arrives validated by BillingPortalSchema (see billing.dto.ts)
  async createPortalSession(req: Request, res: Response) {
    const {
      body: { returnUrl },
    } = getValidatedRequest<BillingPortalRequest>(req);
    const session = await stripeService.createPortalSession({
      organizationId: req.user!.organizationId,
      returnUrl: returnUrl || `${req.headers.origin}/settings`,
    });
    res.json({ data: session });
  }

  /**
   * Strictly verifies Stripe HMAC Webhook Signature from raw Buffer payload.
   * Rejects unauthenticated or unverified requests without fallback.
   */
  async handleWebhook(req: Request, res: Response) {
    const signature = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!signature || typeof signature !== 'string' || !webhookSecret) {
      throw new AppError(
        'Webhook rejected: Missing Stripe signature header or STRIPE_WEBHOOK_SECRET configured on server',
        400
      );
    }

    // req.body is guaranteed to be an unparsed Buffer by express.raw() in app.ts
    const event = stripeService.constructWebhookEvent(req.body, signature);
    // Ledger #10: the service owns the idempotency ledger (retry/duplicate
    // short-circuit + PROCESSED/FAILED marking) and logs both outcomes; the
    // response contract for Stripe stays `{ received: true }` either way.
    await stripeService.handleWebhookEvent(event);

    res.status(200).json({ received: true });
  }
}
