import request from 'supertest';

import app from '../../../app';
import { closeRedisClient } from '../../../core/redis/redis.client';

/*
 * RELEASE FIX (round 9 — 2026-08-07) pins: before the terminal 404
 * handler, an unmatched API route fell through to Express's DEFAULT HTML
 * "Cannot GET ..." body — the only non-JSON response surface in the API,
 * contradicting the api-docs-gate's promised "standard unmatched-route
 * 404 envelope". These pins lock the JSON envelope shape ({ success,
 * requestId, error.message }) for unmatched GET and non-GET requests, and
 * lock OUT the HTML page.
 *
 * Safe to import `app` here: NODE_ENV=test keeps workers/scheduler off
 * (app.ts gate) and the Redis client is lazyConnect.
 */
afterAll(async () => {
  await closeRedisClient();
});

describe('unmatched-route 404 envelope', () => {
  it('returns the standard JSON error envelope with 404 (never the HTML page)', async () => {
    const res = await request(app).get('/api/v1/definitely-not-a-route');

    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body).toMatchObject({
      success: false,
      error: { message: 'Not found: GET /api/v1/definitely-not-a-route' },
    });
    expect(typeof res.body.requestId).toBe('string');
    // The old Express default body must never leak back.
    expect(res.text).not.toContain('Cannot GET');
    expect(res.text).not.toContain('<html>');
  });

  it('covers non-GET methods, and never echoes query strings (API URLs can carry signed params)', async () => {
    // NOTE: /api/v1/uploads/* is intentionally NOT exercised here — that
    // mount is owned by the HMAC signed-download handler, which answers
    // 403 for opaque signatures (its pinned design), not the 404 envelope.
    const res = await request(app).post(
      '/api/v1/nope/deeper?expires=9999999999&signature=deadbeef'
    );

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toBe('Not found: POST /api/v1/nope/deeper');
    expect(res.body.error.message).not.toContain('signature=');
  });
});
