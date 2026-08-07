import { Router } from 'express';

import { validateRequest } from '../../core/middlewares/validateRequest';
import { TeamController } from './team.controller';
import {
  acceptInvitationSchema,
  inspectInvitationSchema,
} from './team.validator';

/*
 * FEATURE (ledger #1, 2026-08-05 — invitation accept lifecycle): PUBLIC
 * invitation surface. Mounted at /api/v1/teams in app.ts BEFORE the
 * authenticated team router, so only these two narrow token-carrying
 * routes are reachable without a session; everything else falls through
 * to the authed router unchanged. There is deliberately NO requireAuth —
 * the HMAC-signed invitation token emailed to the invitee IS the
 * credential (see core/utils/inviteToken.ts), exactly like a password
 * reset link. Still covered by the global /api rate limiter, and the
 * accept handler flips status atomically so token replay is a 409.
 */
const router = Router();
const controller = new TeamController();

// Handlers are referenced directly (no extra asyncWrapper): they are
// class-property arrows already wrapped at declaration in
// team.controller.ts — the same way the authenticated router uses them.
router.get(
  '/invitations/:token',
  validateRequest(inspectInvitationSchema),
  controller.inspectInvitation
);

router.post(
  '/invitations/:token/accept',
  validateRequest(acceptInvitationSchema),
  controller.acceptInvitation
);

export default router;
