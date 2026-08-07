import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

import { env } from '../../config/env';

/*
 * FEATURE (ledger #3, 2026-08-05 — REAL OAuth state verification): the
 * simulated calendar flow passed `state = "orgId:userId"` straight through
 * and NEVER verified it on the callback — a textbook OAuth CSRF hole (an
 * attacker could get an admin's browser to complete a consent flow that
 * binds the ATTACKER's provider account to the victim's workspace).
 *
 * The state is now a short-lived, tamper-proof credential — same
 * engineering posture as the #1 invitation tokens:
 *
 *   state = `${orgId}.${userId}.${provider}.${nonce}.${expiresAtMs}.${sig}`
 *
 * Verified on the callback for signature, freshness (10-minute window —
 * long enough for a consent round-trip, too short to stockpile), and
 * provider match. Stateless: no storage table needed.
 */
const STATE_TTL_MS = 10 * 60 * 1000;

const resolveSigningSecret = (): string => {
  const secret =
    process.env.CALENDAR_OAUTH_STATE_SECRET ||
    process.env.INVITATION_SIGNING_SECRET ||
    process.env.STORAGE_SIGNING_SECRET ||
    env.JWT_REFRESH_SECRET;

  if (!secret || secret.length < 32) {
    throw new Error(
      'Calendar OAuth state signing secret is not configured (CALENDAR_OAUTH_STATE_SECRET or fallback chain, min 32 chars)'
    );
  }

  return secret;
};

const sign = (payload: string): string =>
  createHmac('sha256', resolveSigningSecret())
    .update(payload)
    .digest('base64url');

export interface OAuthStateParts {
  organizationId: string;
  userId: string;
  provider: 'GOOGLE' | 'OUTLOOK';
  expiresAtMs: number;
}

export const createOAuthState = (
  organizationId: string,
  userId: string,
  provider: 'GOOGLE' | 'OUTLOOK'
): { state: string; expiresAtMs: number } => {
  const expiresAtMs = Date.now() + STATE_TTL_MS;
  const payload = [
    organizationId,
    userId,
    provider,
    randomBytes(16).toString('hex'),
    String(expiresAtMs),
  ].join('.');

  return { state: `${payload}.${sign(payload)}`, expiresAtMs };
};

export const verifyOAuthState = (
  state: string
): OAuthStateParts | null => {
  const parts = state.split('.');
  if (parts.length !== 6) return null;

  const [organizationId, userId, provider, nonce, expiresAtRaw, signature] =
    parts;

  const expiresAtMs = Number(expiresAtRaw);
  if (
    !organizationId ||
    !userId ||
    (provider !== 'GOOGLE' && provider !== 'OUTLOOK') ||
    !nonce ||
    !Number.isFinite(expiresAtMs) ||
    !signature
  ) {
    return null;
  }

  const expected = sign(
    [organizationId, userId, provider, nonce, expiresAtRaw].join('.')
  );
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return null;
  }

  return { organizationId, userId, provider, expiresAtMs };
};

export const isOAuthStateExpired = (parts: OAuthStateParts): boolean =>
  parts.expiresAtMs <= Date.now();
