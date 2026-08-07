import { z } from 'zod';

const emptyObjectSchema = z.object({}).strict();

/*
 * BUG FIX (POST /billing/checkout & /billing/portal accepted unvalidated
 * bodies — Bug #43): billing was the ONLY remaining module whose
 * body-reading routes had no `validateRequest` (documents self-validate via
 * document.validator.ts; jobs/system take no bodies). The controller pulled
 * `priceId`, `successUrl`, `cancelUrl` and `returnUrl` straight out of
 * `req.body`, so:
 *   1. A missing/non-string/empty `priceId` flowed into
 *      `stripe.checkout.sessions.create({ line_items: [{ price: undefined }] })`,
 *      threw inside the SDK, and was swallowed by the service's catch-all
 *      "simulated fallback" — which returns a FABRICATED checkout URL
 *      (`https://checkout.stripe.com/pay/cs_test_<orgId>?price=undefined`).
 *      The web client's `onSuccess` then executes
 *      `window.location.href = <junk URL>`, stranding the admin on a dead
 *      Stripe page instead of surfacing an honest validation error.
 *   2. Unbounded, unvalidated `successUrl`/`cancelUrl`/`returnUrl` strings
 *      were handed to Stripe as post-payment redirect targets (any caller
 *      with BILLING.MANAGE could aim the post-checkout redirect anywhere
 *      Stripe would accept, and non-http(s) garbage produced the same
 *      silent-fallback path).
 * The contract now requires a real `priceId` string and restricts every URL
 * field to well-formed http(s) URLs (Stripe's success/cancel/return URLs are
 * always http(s)); all fields stay optional except `priceId`, matching
 * exactly what the web client (useBilling.ts) posts: `{ priceId }` for
 * checkout and `{}` for portal. The unauthenticated `/webhook` route keeps
 * its raw-HMAC verification and intentionally stays validateRequest-free.
 */
const httpUrlSchema = z
  .string()
  .trim()
  .url('must be a valid URL')
  .max(2048, 'URL cannot exceed 2048 characters')
  .refine(
    (value) => /^https?:\/\//i.test(value),
    'must be an http(s) URL',
  );

const checkoutBodySchema = z
  .object({
    priceId: z
      .string()
      .trim()
      .min(1, 'priceId is required')
      .max(255, 'priceId cannot exceed 255 characters'),
    successUrl: httpUrlSchema.optional(),
    cancelUrl: httpUrlSchema.optional(),
  })
  .strict();

const portalBodySchema = z
  .object({
    returnUrl: httpUrlSchema.optional(),
  })
  .strict();

export const BillingCheckoutSchema = z
  .object({
    body: checkoutBodySchema,
    query: emptyObjectSchema,
    params: emptyObjectSchema,
  })
  .strict();

export const BillingPortalSchema = z
  .object({
    body: portalBodySchema,
    query: emptyObjectSchema,
    params: emptyObjectSchema,
  })
  .strict();

export type BillingCheckoutRequest = z.infer<typeof BillingCheckoutSchema>;

export type BillingPortalRequest = z.infer<typeof BillingPortalSchema>;
