import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
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
