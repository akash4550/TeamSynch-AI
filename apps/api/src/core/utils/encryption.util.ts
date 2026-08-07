import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
/*
 * BUG FIX (#106, 2026-08-06): the unset-case fallback below is a DEV/TEST
 * convenience ONLY. Until this fix the variable was documented nowhere, so
 * production deployments ran on this source-published string — any DB dump
 * yielded every stored Google/Outlook OAuth token to anyone holding the
 * repo. env.ts now refuses to BOOT in production without
 * ENCRYPTION_SECRET_KEY; the throw here is defense-in-depth for entry
 * points that bypass env.ts (scripts, one-off workers), so the fallback
 * can never seal production data again.
 *
 * Operator note (rotation): rows written BEFORE a real key was configured
 * were sealed with the fallback key and will fail GCM verification once a
 * real key is set. No code path reads them back today (decryptToken is
 * intentionally callerless while calendar sync is a documented
 * simulation boundary); when provider reads are wired, treat a GCM
 * failure on legacy rows as "reconnect the calendar", never as a retry.
 */
if (
  process.env.NODE_ENV === 'production' &&
  !process.env.ENCRYPTION_SECRET_KEY
) {
  throw new Error(
    'ENCRYPTION_SECRET_KEY is required in production — refusing to encrypt OAuth tokens with the source-published development fallback key',
  );
}

const ENCRYPTION_KEY = process.env.ENCRYPTION_SECRET_KEY
  ? scryptSync(process.env.ENCRYPTION_SECRET_KEY, 'teamsynch-ai_salt', 32)
  : scryptSync('fallback_secret_32_bytes_key_minimum', 'teamsynch-ai_salt', 32);

export interface EncryptedPayload {
  encryptedData: string;
  iv: string;
  authTag: string;
}

/**
 * AES-256-GCM Token Encryption at Rest
 */
export function encryptToken(plainText: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(plainText, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');

  return JSON.stringify({
    encryptedData: encrypted,
    iv: iv.toString('hex'),
    authTag,
  });
}

/**
 * AES-256-GCM Token Decryption
 */
export function decryptToken(encryptedJson: string): string {
  const payload: EncryptedPayload = JSON.parse(encryptedJson);
  const decipher = createDecipheriv(
    ALGORITHM,
    ENCRYPTION_KEY,
    Buffer.from(payload.iv, 'hex')
  );
  decipher.setAuthTag(Buffer.from(payload.authTag, 'hex'));

  let decrypted = decipher.update(payload.encryptedData, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}
