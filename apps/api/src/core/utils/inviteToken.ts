import { createHmac, timingSafeEqual } from 'crypto';

import { env } from '../../config/env';

/*
 * FEATURE (ledger #1 — invitation accept lifecycle, 2026-08-05):
 * Stateless, tamper-proof invitation tokens. The TeamInvitation schema
 * deliberately predates the accept flow and has NO token column, so the
 * token binds the two values that make acceptance safe — the invitation id
 * and its expiry — under HMAC-SHA256:
 *
 *   token = `${invitationId}.${expiresAtMs}.${base64url(hmac)}`
 *
 * Properties without any migration:
 *   - Forgery is impossible without the server secret (HMAC).
 *   - Re-inviting the same team+email UPSERTs the row and BUMPS expiresAt —
 *     the new row no longer matches the old token's bound expiry, so stale
 *     links die automatically (supersede behavior, no revoked-state needed).
 *   - Single-use is enforced at accept time by flipping status PENDING ->
 *     ACCEPTED with an updateMany count===1 double-spend guard.
 *
 * Secret resolution mirrors the #60 storage-URL signing precedent exactly:
 * a dedicated var first, then the storage secret, then JWT_REFRESH_SECRET
 * (which env.ts already requires to be >= 32 chars). Read RAW from
 * process.env, same as LocalStorageProvider — env.ts schema untouched.
 */
const resolveSigningSecret = (): string => {
  const secret =
    process.env.INVITATION_SIGNING_SECRET ||
    process.env.STORAGE_SIGNING_SECRET ||
    env.JWT_REFRESH_SECRET;

  if (!secret || secret.length < 32) {
    throw new Error(
      'Invitation signing secret is not configured (INVITATION_SIGNING_SECRET or STORAGE_SIGNING_SECRET or JWT_REFRESH_SECRET, min 32 chars)'
    );
  }

  return secret;
};

const sign = (payload: string): string =>
  createHmac('sha256', resolveSigningSecret())
    .update(payload)
    .digest('base64url');

export interface InviteTokenParts {
  invitationId: string;
  expiresAtMs: number;
}

export const createInviteToken = (
  invitationId: string,
  expiresAt: Date
): string => {
  const expiresAtMs = expiresAt.getTime();
  const payload = `${invitationId}.${expiresAtMs}`;
  return `${payload}.${sign(payload)}`;
};

/**
 * Verifies ONLY the signature/shape and returns the bound parts. The caller
 * must still check the invitation row: existence, PENDING status, and that
 * row.expiresAt matches the bound expiry (kills tokens superseded by a
 * re-invite) and lies in the future.
 */
export const verifyInviteToken = (
  token: string
): InviteTokenParts | null => {
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [invitationId, expiresAtRaw, signature] = parts;
  const expiresAtMs = Number(expiresAtRaw);
  if (!invitationId || !Number.isFinite(expiresAtMs) || !signature) {
    return null;
  }

  const expected = sign(`${invitationId}.${expiresAtRaw}`);

  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return null;
  }

  return { invitationId, expiresAtMs };
};
