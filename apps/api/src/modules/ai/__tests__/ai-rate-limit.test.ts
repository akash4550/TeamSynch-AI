/*
 * AI endpoint rate limiter tests — deterministic, offline, no network.
 * Mounts the exported limiter factory on a bare express app and verifies
 * the 429 behavior with a small override budget, plus the production
 * config values.
 */

import express from 'express';
import request from 'supertest';
import { AI_RATE_LIMIT, createAIRateLimiter } from '../ai.routes';

describe('AI rate limiter', () => {
  it('uses a sensible production budget (generous for humans, flood-proof)', () => {
    expect(AI_RATE_LIMIT.windowMs).toBe(15 * 60 * 1000);
    expect(AI_RATE_LIMIT.max).toBe(300);
    expect(AI_RATE_LIMIT.standardHeaders).toBe(true);
    expect(AI_RATE_LIMIT.legacyHeaders).toBe(false);
    expect(AI_RATE_LIMIT.message).toEqual({
      error: 'Too many AI requests, please try again later.',
    });
  });

  it('returns 429 once the budget is exhausted and 200 before that', async () => {
    const app = express();
    app.use(createAIRateLimiter({ windowMs: 60_000, max: 3 }));
    app.get('/probe', (_req, res) => res.status(200).json({ ok: true }));

    for (let i = 0; i < 3; i += 1) {
      const res = await request(app).get('/probe');
      expect(res.status).toBe(200);
    }

    const blocked = await request(app).get('/probe');
    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toBe('Too many AI requests, please try again later.');
  });

  it('tracks clients independently', async () => {
    const app = express();
    // Honor X-Forwarded-For so the test can simulate distinct clients.
    app.set('trust proxy', true);
    app.use(createAIRateLimiter({ windowMs: 60_000, max: 2 }));
    app.get('/probe', (_req, res) => res.status(200).json({ ok: true }));

    // Exhaust the budget from one IP...
    await request(app).get('/probe');
    await request(app).get('/probe');
    expect((await request(app).get('/probe')).status).toBe(429);

    // ...a different IP is still allowed.
    const other = await request(app).get('/probe').set('X-Forwarded-For', '10.0.0.99');
    expect(other.status).toBe(200);
  });
});
