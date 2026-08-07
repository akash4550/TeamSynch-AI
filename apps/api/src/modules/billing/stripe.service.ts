import Stripe from 'stripe';
import { prisma } from '../../config/prisma';
import { AppError } from '../../core/errors/AppError';
import { eventBus } from '../../core/events/EventBus';
import { emailQueue } from '../jobs/queues';
import { RealtimeService } from '../realtime/realtime.service';
import { logger } from '../../core/utils/logger';
import {
  hasStripePriceMapping,
  isPlanTier,
  planForStripePrice,
} from './plans.config';

export interface CreateCheckoutSessionInput {
  organizationId: string;
  userId: string;
  priceId: string;
  successUrl: string;
  cancelUrl: string;
}

export interface CreatePortalSessionInput {
  organizationId: string;
  returnUrl: string;
}

export class StripeBillingService {
  private stripe: Stripe;
  private realtimeService = new RealtimeService();

  /*
   * BUG FIX (#91, 2026-08-05 — fabricated billing URLs): when no
   * STRIPE_SECRET_KEY was set (or ANY Stripe call failed), both session
   * factories silently returned INVENTED URLs
   * (`https://checkout.stripe.com/pay/cs_test_<orgId>?price=…`,
   * `https://billing.stripe.com/p/session/test_<orgId>`) that lead
   * nowhere — the "Upgrade"/"Manage billing" buttons redirected real
   * users onto a fake Stripe page with zero signal. That is the same
   * fiction class ledger #3 deleted from calendar OAuth, and the same
   * fail-closed answer applies: unconfigured billing answers 503 honestly
   * (the Subscription Settings page renders the inline message) and a
   * real provider error answers 502 without inventing anything. The SDK
   * instance itself performs no I/O at construction; it is still created
   * unconditionally because webhook SIGNATURE verification needs it even
   * on servers that never call the API — the non-key-looking placeholder
   * below can never be confused for a real credential.
   */
  private readonly billingConfigured: boolean;

  constructor() {
    const apiKey = process.env.STRIPE_SECRET_KEY;
    this.billingConfigured = Boolean(apiKey);
    this.stripe = new Stripe(apiKey || 'billing_unconfigured_no_api_calls', {
      apiVersion: '2025-01-27.acacia' as any,
    });
  }

  /**
   * Constructs and verifies Stripe Webhook Signature from raw request body
   */
  constructWebhookEvent(rawBody: Buffer | string, signature: string): Stripe.Event {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      throw new AppError('STRIPE_WEBHOOK_SECRET is not configured on server', 500);
    }

    try {
      return this.stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } catch (err: any) {
      logger.error(`[StripeWebhook] Signature verification failed: ${err.message}`);
      throw new AppError(`Webhook Signature Verification Failed: ${err.message}`, 400);
    }
  }

  /**
   * Creates a Stripe Checkout Session for subscription upgrades
   */
  async createCheckoutSession(input: CreateCheckoutSessionInput): Promise<{ checkoutUrl: string }> {
    // BUG FIX (#91): fail closed — never fabricate a checkout URL.
    if (!this.billingConfigured) {
      throw new AppError(
        'Billing checkout is not configured on this server (STRIPE_SECRET_KEY is missing)',
        503
      );
    }

    const org = await prisma.organization.findFirst({
      where: { id: input.organizationId, deletedAt: null, isActive: true },
    });

    if (!org) {
      throw new AppError('Organization not found', 404);
    }

    try {
      /*
       * FEATURE (ledger #11 — real subscription plumbing): resolve the plan
       * from the price↔plan mapping and propagate it ONTO THE SUBSCRIPTION
       * via subscription_data.metadata. Before this:
       *   1. metadata lived only on the checkout SESSION — the resulting
       *      subscription (the object every customer.subscription.* webhook
       *      actually carries) had no organizationId, so the webhook silently
       *      no-opped on `if (organizationId)`, and
       *   2. the org's plan defaulted to 'PRO' regardless of purchase.
       */
      if (!hasStripePriceMapping()) {
        throw new AppError(
          'Billing price mapping is not configured on this server (STRIPE_PRICE_STARTER / STRIPE_PRICE_PRO / STRIPE_PRICE_BUSINESS are missing)',
          503
        );
      }
      const planTier = planForStripePrice(input.priceId);
      if (!planTier) {
        throw new AppError(
          'Unknown priceId — it is not mapped to any plan tier (check STRIPE_PRICE_* configuration or the client payload)',
          400
        );
      }

      const session = await this.stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        mode: 'subscription',
        customer_email: undefined,
        client_reference_id: org.id,
        metadata: {
          organizationId: org.id,
          userId: input.userId,
        },
        subscription_data: {
          metadata: {
            organizationId: org.id,
            userId: input.userId,
            planTier,
          },
        },
        line_items: [
          {
            price: input.priceId,
            quantity: 1,
          },
        ],
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
      });

      if (!session.url) {
        throw new AppError(
          'Billing provider returned no checkout URL — please try again',
          502
        );
      }

      return { checkoutUrl: session.url };
    } catch (e: any) {
      if (e instanceof AppError) throw e;
      logger.error(`[Stripe] Checkout session creation failed: ${e.message}`);
      throw new AppError(
        'The billing provider could not start checkout — please try again',
        502
      );
    }
  }

  /**
   * Creates a Stripe Customer Portal Session for managing payment methods & billing
   */
  async createPortalSession(input: CreatePortalSessionInput): Promise<{ portalUrl: string }> {
    // BUG FIX (#91): fail closed — never fabricate a portal URL.
    if (!this.billingConfigured) {
      throw new AppError(
        'The billing portal is not configured on this server (STRIPE_SECRET_KEY is missing)',
        503
      );
    }

    const org = await prisma.organization.findFirst({
      where: { id: input.organizationId, deletedAt: null, isActive: true },
    });

    if (!org) {
      throw new AppError('Organization not found', 404);
    }

    try {
      const session = await this.stripe.billingPortal.sessions.create({
        customer: org.id,
        return_url: input.returnUrl,
      });

      return { portalUrl: session.url };
    } catch (e: any) {
      if (e instanceof AppError) throw e;
      logger.error(`[Stripe] Portal session creation failed: ${e.message}`);
      throw new AppError(
        'The billing provider could not open the portal — please try again',
        502
      );
    }
  }

  /**
   * FEATURE (ledger #10, 2026-08-05) — ATOMIC idempotency claim for webhook
   * side effects. The previous comment called this "Idempotent & Atomic"
   * while NOTHING was: Stripe retries every non-2xx (and replays from the
   * Dashboard) for up to 3 days, and every delivery re-ran the full effect
   * fan-out — duplicate SEND_BILLING_RECEIPT emails and duplicate
   * ProjectUpdated audit rows per genuine event.
   *
   * The claim ledger (WebhookEvent table, migration 20260805020000) makes
   * the FIRST delivery the only effective one:
   *   1. INSERT (provider, eventId → PROCESSING). The unique key
   *      serializes concurrent deliveries — no SELECT-then-INSERT race.
   *   2. P2002 ⇒ a row exists:
   *      - PROCESSED            → duplicate; skip (200, effects ran once);
   *      - fresh PROCESSING     → an in-flight attempt owns it; skip —
   *        Stripe's later retry re-claims from FAILED if that attempt dies;
   *      - FAILED / stale PROCESSING (>10 min without completion ⇒ the
   *        previous attempt crashed mid-fan-out) → guarded re-claim
   *        (updateMany count===1, attempts incremented) and re-process.
   *   3. Effects run; the row is marked PROCESSED. On ANY throw the row is
   *      marked FAILED (best-effort; never masks the original error) and
   *      the error propagates → controller 500 → Stripe retries → rule 2
   *      re-claims. Residual crash window (effects partially applied, then
   *      crash before FAILED write) is covered by the stale-PROCESSING
   *      re-claim on the next retry.
   */
  private static readonly WEBHOOK_STALE_PROCESSING_MS = 10 * 60 * 1000;

  async handleWebhookEvent(event: Stripe.Event): Promise<{ duplicate: boolean }> {
    const provider = 'stripe';
    const eventId = event.id;

    let claimed = false;
    try {
      await prisma.webhookEvent.create({
        data: { provider, eventId, eventType: event.type, status: 'PROCESSING' },
      });
      claimed = true;
    } catch (error: any) {
      if (error?.code !== 'P2002') throw error;

      const existing = await prisma.webhookEvent.findUnique({
        where: { provider_eventId: { provider, eventId } },
      });
      if (!existing) {
        // Unique-violation without a readable row — transient; let Stripe's
        // retry machinery take another shot (500 path).
        throw error;
      }

      if (existing.status === 'PROCESSED') {
        logger.info(`[StripeWebhook] Duplicate delivery of ${eventId} (${event.type}) — effects already applied once; skipping`);
        return { duplicate: true };
      }

      if (
        existing.status === 'PROCESSING' &&
        Date.now() - new Date(existing.updatedAt).getTime() <
          StripeBillingService.WEBHOOK_STALE_PROCESSING_MS
      ) {
        logger.info(`[StripeWebhook] ${eventId} is already in-flight — acknowledging without duplicate effects`);
        return { duplicate: true };
      }

      // FAILED, or PROCESSING gone stale (crashed attempt): guarded re-claim.
      const reclaim = await prisma.webhookEvent.updateMany({
        where: {
          provider,
          eventId,
          OR: [
            { status: 'FAILED' },
            {
              status: 'PROCESSING',
              updatedAt: {
                lt: new Date(Date.now() - StripeBillingService.WEBHOOK_STALE_PROCESSING_MS),
              },
            },
          ],
        },
        data: { status: 'PROCESSING', attempts: { increment: 1 } },
      });
      claimed = reclaim.count === 1;
      if (!claimed) {
        // State flipped between findUnique and re-claim — another attempt
        // owns it now; safe skip, Stripe will retry if that one fails.
        return { duplicate: true };
      }
      logger.warn(`[StripeWebhook] Re-claiming ${eventId} (${event.type}) after ${existing.status} — attempt ${existing.attempts + 1}`);
    }

    try {
      await this.processWebhookEvent(event);
    } catch (error: any) {
      await prisma.webhookEvent
        .update({
          where: { provider_eventId: { provider, eventId } },
          data: {
            status: 'FAILED',
            lastError: String(error?.message ?? error).slice(0, 2000),
          },
        })
        .catch((markError: unknown) => {
          logger.error(
            `[StripeWebhook] Failed to record failure for ${eventId}: ${
              markError instanceof Error ? markError.message : String(markError)
            }`
          );
        });
      throw error;
    }

    await prisma.webhookEvent.update({
      where: { provider_eventId: { provider, eventId } },
      data: { status: 'PROCESSED', processedAt: new Date(), lastError: null },
    });

    return { duplicate: false };
  }

  /**
   * The side-effect fan-out for a genuinely-new (or re-claimed) delivery.
   * Invoked exclusively through the ledger claim in handleWebhookEvent.
   */
  /*
   * FEATURE (ledger #11): honest subscription-status mapping. Previously
   * everything not 'active' became PAST_DUE — a trialing org was told it
   * owed money. Unknown future statuses echo through (uppercased, warned),
   * never silently relabeled.
   */
  private static mapSubscriptionStatus(status: string | undefined): string {
    switch (status) {
      case 'active': return 'ACTIVE';
      case 'trialing': return 'TRIALING';
      case 'past_due':
      case 'unpaid': return 'PAST_DUE';
      case 'canceled': return 'CANCELED';
      case 'incomplete': return 'INCOMPLETE';
      case 'incomplete_expired': return 'INCOMPLETE_EXPIRED';
      case 'paused': return 'PAUSED';
      default: {
        const echo = (status || 'unknown').toUpperCase();
        logger.warn(`[StripeWebhook] Unmapped subscription status '${status}' — echoing '${echo}' honestly`);
        return echo;
      }
    }
  }

  /*
   * FEATURE (ledger #11): plan resolution with ZERO defaulting —
   * metadata.planTier (validated against known tiers) first, then the
   * subscription's actual price via the operator mapping. An org-scoped
   * event whose plan still can't be resolved is a CONFIGURATION failure:
   * thrown loudly (the #10 ledger marks the delivery FAILED and Stripe
   * retries after ops fixes the mapping), never silently provisioned PRO.
   */
  private resolvePlanTier(sessionOrSub: any, organizationId: string): string {
    if (isPlanTier(sessionOrSub.metadata?.planTier)) {
      return sessionOrSub.metadata.planTier;
    }
    const priceId = sessionOrSub.items?.data?.[0]?.price?.id;
    const fromPrice = planForStripePrice(priceId);
    if (fromPrice) {
      return fromPrice;
    }
    throw new AppError(
      `Cannot resolve plan tier for subscription on org ${organizationId} ` +
        `(price '${priceId ?? 'none'}' is not mapped to any plan — check STRIPE_PRICE_* configuration)`,
      500
    );
  }

  private async processWebhookEvent(event: Stripe.Event): Promise<void> {
    const { type, data } = event;
    const sessionOrSub = data.object as any;

    logger.info(`[StripeWebhook] Processing event type: ${type}`);

    if (type === 'customer.subscription.created' || type === 'customer.subscription.updated') {
      const organizationId = sessionOrSub.client_reference_id || sessionOrSub.metadata?.organizationId;

      // FEATURE (ledger #11): an unattributable event (no organizationId)
      // is skipped WITH A TRACE — throwing here would repeatedly 500 the
      // endpoint for events that can never resolve (foreign events on a
      // shared Stripe account), which eventually gets the endpoint
      // disabled. Attributable-but-misconfigured events, by contrast, fail
      // loudly inside resolvePlanTier (FAILED ledger + Stripe retry).
      if (!organizationId) {
        logger.warn(`[StripeWebhook] ${type} carried no organizationId (metadata/client_reference_id) — skipping effects for unattributable event`);
      }

      if (organizationId) {
        // FEATURE (ledger #11): was `sessionOrSub.metadata?.planTier || 'PRO'`
        // — every mapped purchase (incl. BUSINESS) silently became PRO.
        const planTier = this.resolvePlanTier(sessionOrSub, organizationId);
        const status = StripeBillingService.mapSubscriptionStatus(sessionOrSub.status);

        await prisma.$transaction(async (tx) => {
          await tx.organization.update({
            where: { id: organizationId },
            data: {
              plan: planTier,
              subscriptionStatus: status,
            },
          });
        });

        // Broadcast real-time websocket update to organization members
        this.realtimeService.emitToOrganization(organizationId, 'billing.subscription.updated', {
          plan: planTier,
          status,
          updatedAt: new Date().toISOString(),
        });

        // Offload email sending to BullMQ queue
        await emailQueue.add('SEND_BILLING_RECEIPT', {
          organizationId,
          userId: sessionOrSub.metadata?.userId || 'system',
          to: sessionOrSub.customer_email || 'admin@organization.com',
          subject: 'TeamSynch AI Subscription Updated',
          template: 'billing_updated',
          context: { plan: planTier },
        });

        eventBus.emitEvent('ProjectUpdated', { organizationId, action: 'SubscriptionUpdated' });
      }
    } else if (type === 'customer.subscription.deleted') {
      const organizationId = sessionOrSub.client_reference_id || sessionOrSub.metadata?.organizationId;

      if (organizationId) {
        await prisma.$transaction(async (tx) => {
          await tx.organization.update({
            where: { id: organizationId },
            data: {
              plan: 'FREE',
              subscriptionStatus: 'CANCELED',
            },
          });
        });

        this.realtimeService.emitToOrganization(organizationId, 'billing.subscription.updated', {
          plan: 'FREE',
          status: 'CANCELED',
          updatedAt: new Date().toISOString(),
        });
      }
    } else if (type === 'invoice.payment_failed') {
      const organizationId = sessionOrSub.subscription_details?.metadata?.organizationId || sessionOrSub.metadata?.organizationId;

      if (organizationId) {
        await prisma.$transaction(async (tx) => {
          await tx.organization.update({
            where: { id: organizationId },
            data: {
              subscriptionStatus: 'PAST_DUE',
            },
          });
        });

        // Emit realtime warning to organization room
        this.realtimeService.emitToOrganization(organizationId, 'billing.payment_failed', {
          organizationId,
          status: 'PAST_DUE',
          message: 'Payment failed for current billing period. Please update your payment method.',
          timestamp: new Date().toISOString(),
        });
      }
    }
  }
}
