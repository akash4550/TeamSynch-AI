import { Router } from 'express';
import { validateRequest } from '../../core/middlewares/validateRequest';
import { asyncWrapper } from '../../core/utils/asyncWrapper';
import { CalendarController } from './calendar.controller';
import { oauthCallbackSchema } from './calendar.validator';

/*
 * FEATURE (ledger #3, 2026-08-05 — real OAuth callback): PUBLIC surface,
 * mounted at /api/v1/calendar BEFORE the authenticated router in app.ts.
 * Google/Microsoft redirect the admin's browser here as a cross-site GET —
 * no session bearer token is attached (the old session-gated callback
 * only ever "worked" because the flow was invoked through axios in the
 * simulation). Authentication is the verified HMAC state (10-minute TTL,
 * provider-matched), exactly like expiring OAuth state is meant to work.
 * Only this one narrow route; everything else falls through to the
 * authed router, and the global /api rate limiter still applies.
 */
const router = Router();
const controller = new CalendarController();

router.get(
  '/callback/:provider',
  validateRequest(oauthCallbackSchema),
  asyncWrapper(controller.handleCallback.bind(controller))
);

export default router;
