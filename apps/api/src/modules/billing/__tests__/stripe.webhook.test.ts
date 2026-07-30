import crypto from 'node:crypto';
import { BillingController } from '../billing.controller';
import { StripeBillingService } from '../stripe.service';
import { AppError } from '../../../core/errors/AppError';
import { closeRedisClient } from '../../../core/redis/redis.client';

describe('Stripe Webhook Signature Verification Tests', () => {
  let billingController: BillingController;
  const mockWebhookSecret = 'whsec_test_secret_key_for_unit_tests_12345';

  beforeEach(() => {
    jest.restoreAllMocks();
    billingController = new BillingController();
    process.env.STRIPE_WEBHOOK_SECRET = mockWebhookSecret;
    process.env.STRIPE_SECRET_KEY = 'sk_test_dummy_key';
  });

  afterAll(async () => {
    await closeRedisClient();
  });

  afterEach(() => {
    delete process.env.STRIPE_WEBHOOK_SECRET;
    jest.restoreAllMocks();
  });

  function generateStripeSignature(payload: string, secret: string): string {
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = crypto
      .createHmac('sha256', secret)
      .update(`${timestamp}.${payload}`, 'utf8')
      .digest('hex');
    return `t=${timestamp},v1=${signature}`;
  }

  it('1. missing stripe-signature -> throws 400 AppError', async () => {
    const req: any = {
      headers: {},
      body: Buffer.from('{"id":"evt_123"}'),
    };
    const res: any = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    await expect(billingController.handleWebhook(req, res)).rejects.toThrow(AppError);
    await expect(billingController.handleWebhook(req, res)).rejects.toHaveProperty('statusCode', 400);
  });

  it('2. invalid stripe-signature -> throws 400 AppError from constructWebhookEvent', async () => {
    const rawPayload = JSON.stringify({ id: 'evt_test_invalid_sig', type: 'payment_intent.succeeded' });
    const req: any = {
      headers: {
        'stripe-signature': 't=12345,v1=invalid_signature_hash_here',
      },
      body: Buffer.from(rawPayload),
    };
    const res: any = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    await expect(billingController.handleWebhook(req, res)).rejects.toThrow(AppError);
  });

  it('3. missing STRIPE_WEBHOOK_SECRET configured on server -> throws 400 AppError', async () => {
    delete process.env.STRIPE_WEBHOOK_SECRET;
    const req: any = {
      headers: {
        'stripe-signature': 't=12345,v1=some_sig',
      },
      body: Buffer.from('{"id":"evt_123"}'),
    };
    const res: any = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    await expect(billingController.handleWebhook(req, res)).rejects.toThrow(AppError);
    await expect(billingController.handleWebhook(req, res)).rejects.toHaveProperty('statusCode', 400);
  });

  it('4. valid signature -> constructs event, handles event and returns 200 { received: true }', async () => {
    const rawPayload = JSON.stringify({
      id: 'evt_test_valid_123',
      object: 'event',
      type: 'customer.subscription.created',
      data: {
        object: {
          client_reference_id: 'org_test_123',
          status: 'active',
          metadata: { planTier: 'PRO' },
        },
      },
    });

    const validSignature = generateStripeSignature(rawPayload, mockWebhookSecret);

    const req: any = {
      headers: {
        'stripe-signature': validSignature,
      },
      body: Buffer.from(rawPayload),
    };

    const res: any = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    jest.spyOn(StripeBillingService.prototype, 'handleWebhookEvent').mockResolvedValueOnce();

    await billingController.handleWebhook(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ received: true });
  });

});
