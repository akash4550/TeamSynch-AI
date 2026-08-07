import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { env } from '../../config/env';
import { IStorageProvider, StorageFilePayload, UploadResult } from './IStorageProvider';

const SAFE_STORAGE_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const SAFE_EXTENSION = /^\.[A-Za-z0-9]{1,10}$/;

export class LocalStorageProvider implements IStorageProvider {
  private readonly baseUploadDir: string;

  constructor() {
    this.baseUploadDir = path.resolve(process.cwd(), 'uploads');
    if (!fs.existsSync(this.baseUploadDir)) {
      fs.mkdirSync(this.baseUploadDir, { recursive: true });
    }
  }

  private normalizeStorageKey(value: string, fieldName: string): string {
    const normalized = value.replace(/\\/g, '/');
    const segments = normalized.split('/');

    if (
      normalized.length === 0 ||
      path.isAbsolute(value) ||
      segments.some((segment) => !SAFE_STORAGE_SEGMENT.test(segment))
    ) {
      throw new Error(`Invalid ${fieldName}`);
    }

    return segments.join('/');
  }

  private resolveStoragePath(storageKey: string): string {
    const normalizedKey = this.normalizeStorageKey(storageKey, 'storage key');
    const targetPath = path.resolve(this.baseUploadDir, ...normalizedKey.split('/'));
    const relativePath = path.relative(this.baseUploadDir, targetPath);

    if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
      throw new Error('Storage path escapes the upload directory');
    }

    return targetPath;
  }

  /*
   * BUG FIX (#64): download URLs now carry the /api/v1 prefix. The previous
   * bare '/uploads/...' never resolved anywhere in production (no backend
   * route served it) AND could not even reach the API in development —
   * the web client's proxy (vite.config) forwards only '/api' and
   * '/socket.io'. Issued URLs therefore dead-ended for every consumer
   * (document viewer, version downloads, audit CSV export). With the
   * /api/v1/uploads mount (signedDownloadHandler), the same URL resolves
   * through the existing proxy path and directly against the API host.
   * Note: rows persisted with the OLD '/uploads/...' prefix in their `url`
   * field remain dead (they always were — nothing ever served them);
   * fresh responses mint the working prefix.
   */
  private toPublicUrl(storageKey: string): string {
    const normalizedKey = this.normalizeStorageKey(storageKey, 'storage key');
    const encodedKey = normalizedKey.split('/').map(encodeURIComponent).join('/');
    return `/api/v1/uploads/${encodedKey}`;
  }

  async uploadFile(file: StorageFilePayload, pathPrefix: string): Promise<UploadResult> {
    const normalizedPrefix = this.normalizeStorageKey(pathPrefix, 'storage path prefix');
    const candidateExtension = path.extname(file.originalname);
    const extension = SAFE_EXTENSION.test(candidateExtension) ? candidateExtension.toLowerCase() : '';
    const fileName = `${crypto.randomUUID()}${extension}`;
    const storageKey = `${normalizedPrefix}/${fileName}`;

    const targetDir = this.resolveStoragePath(normalizedPrefix);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const targetPath = this.resolveStoragePath(storageKey);

    if (!file.buffer) {
      throw new Error('No file buffer provided in payload');
    }

    fs.writeFileSync(targetPath, file.buffer);

    return {
      key: storageKey,
      url: this.toPublicUrl(storageKey),
      size: file.size,
      mimeType: file.mimetype,
    };
  }

  /*
   * BUG FIX (#64): file byte reader used exclusively by signedDownloadHandler
   * AFTER the HMAC gate — resolveStoragePath re-applies traversal hardening
   * defensively in depth (verifySignedDownloadUrl already normalized).
   */
  async getFileBuffer(key: string): Promise<Buffer> {
    const targetPath = this.resolveStoragePath(key);
    if (!fs.existsSync(targetPath)) {
      throw new Error('File not found');
    }
    return fs.promises.readFile(targetPath);
  }

  async deleteFile(key: string): Promise<boolean> {
    try {
      const targetPath = this.resolveStoragePath(key);
      if (fs.existsSync(targetPath)) {
        fs.unlinkSync(targetPath);
      }
      return true;
    } catch (error) {
      console.error('Failed to delete file', error);
      return false;
    }
  }

  async getFileUrl(key: string): Promise<string> {
    return this.toPublicUrl(key);
  }

  /*
   * BUG FIX (#60 — the "signed" download URL was a forgeable pseudo-signature):
   * the previous implementation produced
   *   sig = base64url(`${key}:${expiryMs}`)
   * — a reversible ENCODING, not a MAC. Anyone holding one real URL (e.g. the
   * audit-export download link, signed for 3600s and emitted over sockets)
   * could decode it, learn the scheme, and re-encode `ANY_OTHER_KEY:any_far_
   * future_expiry` — forging a "signed" URL for every stored file of every
   * tenant the day any static /uploads serving is enabled. The URL is now
   * MAC'd with HMAC-SHA256 over `key:expiresAt` keyed by
   * STORAGE_SIGNING_SECRET (falling back to JWT_REFRESH_SECRET, which env.ts
   * always resolves — dev default, required in production). The `expires`
   * query value also changed semantics from relative-seconds to an ABSOLUTE
   * epoch-ms deadline: nothing ever verified the old value (no verifier
   * existed anywhere — verified by census of all 7 call sites, which treat
   * the URL as an opaque string), and the absolute timestamp is what a
   * verifier must check. /uploads is still NOT served by the API; the first
   * route that ever serves stored bytes MUST gate on
   * verifySignedDownloadUrl() below.
   */
  private getSigningSecret(): string {
    const secret = process.env.STORAGE_SIGNING_SECRET || env.JWT_REFRESH_SECRET;
    if (!secret || secret.length < 32) {
      throw new Error(
        'Storage URL signing secret is not configured (STORAGE_SIGNING_SECRET or JWT_REFRESH_SECRET, min 32 chars)'
      );
    }
    return secret;
  }

  private computeDownloadSignature(normalizedKey: string, expiresAt: number): string {
    return crypto
      .createHmac('sha256', this.getSigningSecret())
      .update(`${normalizedKey}:${expiresAt}`)
      .digest('base64url');
  }

  async getSignedDownloadUrl(key: string, expiresInSeconds = 900): Promise<string> {
    const normalizedKey = this.normalizeStorageKey(key, 'storage key');
    const expiresAt = Date.now() + expiresInSeconds * 1000;
    const signature = this.computeDownloadSignature(normalizedKey, expiresAt);

    return `${this.toPublicUrl(normalizedKey)}?expires=${expiresAt}&sig=${signature}`;
  }

  /**
   * Verifies a `sig`/`expires` pair produced by getSignedDownloadUrl.
   * Returns false (never throws) for malformed, expired, tampered or
   * legacy base64 pseudo-signatures. Constant-time comparison.
   */
  verifySignedDownloadUrl(key: string, expiresAt: number | string, signature: string): boolean {
    let normalizedKey: string;
    try {
      normalizedKey = this.normalizeStorageKey(key, 'storage key');
    } catch {
      return false;
    }

    const expiry = typeof expiresAt === 'string' ? Number(expiresAt) : expiresAt;
    if (!Number.isFinite(expiry) || expiry < Date.now()) {
      return false;
    }

    let expected: string;
    try {
      expected = this.computeDownloadSignature(normalizedKey, expiry);
    } catch {
      return false;
    }

    const received = Buffer.from(String(signature));
    const wanted = Buffer.from(expected);
    if (received.length !== wanted.length) {
      return false;
    }
    return crypto.timingSafeEqual(received, wanted);
  }

  getProviderName(): string {
    return 'local';
  }
}
