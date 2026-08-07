import crypto from 'crypto';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { IStorageProvider, StorageFilePayload, UploadResult } from './IStorageProvider';
import { AppError } from '../errors/AppError';
import { logger } from '../utils/logger';

/*
 * FEATURE (ledger #7 — 2026-08-05): real S3 SDK wiring for uploadFile and
 * deleteFile. Until now BOTH methods were simulation stubs:
 *   - uploadFile logged "File uploaded" and returned a fabricated URL having
 *     sent ZERO bytes anywhere — the documents table then pointed at S3
 *     objects that never existed, so every signed download 404'd/403'd and
 *     the org's byte usage was recorded against thin air.
 *   - deleteFile logged "Deleted object" and returned true having deleted
 *     nothing — a silently diverging ledger: rows soft-deleted here while
 *     the (real, billed) objects would have lived on in the bucket.
 * Both ops now issue genuine @aws-sdk/client-s3 PutObject/DeleteObject and
 * fail CLOSED (precedent: BUG FIX #91 stripe fail-closed):
 *   - missing configuration → AppError 503 naming the absent env vars;
 *   - upstream S3 rejection  → AppError 502 (never a fabricated success).
 * S3-compatible stores (MinIO, Cloudflare R2, …): set AWS_S3_ENDPOINT —
 * path-style addressing is then enabled automatically (MinIO's default
 * virtual-hosting is off); override with AWS_S3_FORCE_PATH_STYLE=false.
 * getSignedDownloadUrl keeps the #60 stdlib SigV4 presign (verified real),
 * so downloads work with the same credentials and zero extra dependency.
 */
interface ResolvedS3Config {
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  endpoint?: string;
  forcePathStyle: boolean;
}

export class S3StorageProvider implements IStorageProvider {
  private bucket: string;
  private region: string;
  private client?: S3Client;

  /*
   * Optional client injection exists so tests/dry-run harnesses can capture
   * commands without network access; production callers (StorageFactory,
   * DocumentService, OrganizationService, AuditExportProcessor) construct
   * with no arguments and get the lazily-built env-configured client.
   */
  constructor(injectedClient?: S3Client) {
    this.bucket = process.env.AWS_S3_BUCKET || 'teamsynch-ai-uploads';
    this.region = process.env.AWS_REGION || 'us-east-1';
    this.client = injectedClient;
  }

  /* Resolve env fresh per operation (process-static in production; keeps
   * harness cases deterministic) and fail closed on anything missing. */
  private resolveConfig(): ResolvedS3Config {
    const bucket = process.env.AWS_S3_BUCKET;
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
    // Single compound guard: throwing from here also narrows all three
    // env reads to `string` below (tsc strict cannot narrow via a length
    // check on a separately-pushed `missing` array — harness self-catch).
    if (!bucket || !accessKeyId || !secretAccessKey) {
      const missing = [
        ...(!bucket ? ['AWS_S3_BUCKET'] : []),
        ...(!accessKeyId ? ['AWS_ACCESS_KEY_ID'] : []),
        ...(!secretAccessKey ? ['AWS_SECRET_ACCESS_KEY'] : []),
      ];
      throw new AppError(
        `S3 storage is not configured (missing: ${missing.join(', ')})`,
        503
      );
    }
    const endpoint = process.env.AWS_S3_ENDPOINT?.replace(/\/+$/, '') || undefined;
    // MinIO & co. default to path-style; AWS S3 ignores the flag for
    // non-website endpoints. Explicit env wins over the endpoint heuristic.
    const forcePathStyle = process.env.AWS_S3_FORCE_PATH_STYLE
      ? process.env.AWS_S3_FORCE_PATH_STYLE === 'true'
      : Boolean(endpoint);
    return {
      bucket,
      region: process.env.AWS_REGION || 'us-east-1',
      accessKeyId,
      secretAccessKey,
      endpoint,
      forcePathStyle,
    };
  }

  /* Memoized lazily: S3Client creation per upload would build (and leak)
   * a fresh connection pool for every object. Env is process-static, so a
   * first-resolution memo is safe; an injected client always wins. */
  private getClient(config: ResolvedS3Config): S3Client {
    if (!this.client) {
      this.client = new S3Client({
        region: config.region,
        credentials: {
          accessKeyId: config.accessKeyId,
          secretAccessKey: config.secretAccessKey,
        },
        ...(config.endpoint ? { endpoint: config.endpoint } : {}),
        forcePathStyle: config.forcePathStyle,
      });
    }
    return this.client;
  }

  private buildObjectUrl(key: string): string {
    const customDomain = process.env.AWS_S3_CUSTOM_DOMAIN?.replace(/\/+$/, '');
    const encodedKey = key.split('/').map(encodeURIComponent).join('/');
    return customDomain
      ? `${customDomain}/${encodedKey}`
      : `https://${this.bucket}.s3.${this.region}.amazonaws.com/${encodedKey}`;
  }

  async uploadFile(file: StorageFilePayload, pathPrefix: string): Promise<UploadResult> {
    if (!file.buffer || file.buffer.length === 0) {
      // Honest contract: without bytes there is nothing to PUT. All current
      // callers (multer memoryStorage documents/logos, audit-export buffer)
      // always supply one.
      throw new AppError('Cannot upload to S3 without a file buffer', 400);
    }

    const config = this.resolveConfig();
    const client = this.getClient(config);
    const key = `${pathPrefix}/${Date.now()}-${file.originalname}`;

    try {
      await client.send(
        new PutObjectCommand({
          Bucket: config.bucket,
          Key: key,
          Body: file.buffer,
          ContentType: file.mimetype,
          ContentLength: file.buffer.length,
          // SSE is intentionally left to the bucket's default-encryption
          // setting: forcing AES256 here breaks aws:kms-defaulted buckets
          // and vice versa.
        })
      );
    } catch (error) {
      logger.error('[S3StorageProvider] Upload failed', {
        key,
        bucket: config.bucket,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new AppError(
        `S3 upload failed: ${error instanceof Error ? error.message : String(error)}`,
        502
      );
    }

    logger.info(`[S3StorageProvider] File uploaded: ${key} to bucket ${config.bucket}`);

    return {
      key,
      url: this.buildObjectUrl(key),
      size: file.size,
      mimeType: file.mimetype,
    };
  }

  async deleteFile(key: string): Promise<boolean> {
    const config = this.resolveConfig();
    const client = this.getClient(config);

    try {
      await client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key }));
    } catch (error) {
      logger.error('[S3StorageProvider] Delete failed', {
        key,
        bucket: config.bucket,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new AppError(
        `S3 delete failed: ${error instanceof Error ? error.message : String(error)}`,
        502
      );
    }

    /*
     * DeleteObject is idempotent: S3 answers 204 whether or not the key
     * existed, and in both cases the postcondition "this object no longer
     * exists" is genuinely true — so a literal `true` here is an honest
     * statement, not a fabrication. Any actual failure throws above.
     */
    logger.info(`[S3StorageProvider] Deleted object key: ${key}`);
    return true;
  }

  async getFileUrl(key: string): Promise<string> {
    return this.getSignedDownloadUrl(key, 900);
  }

  /*
   * BUG FIX (#60 — pretend-signed URLs, S3 side): the previous implementation
   * appended SigV4-SHAPED query params (X-Amz-Algorithm=AWS4-HMAC-SHA256,
   * X-Amz-Expires, X-Amz-Date) with NO X-Amz-Credential and NO
   * X-Amz-Signature — every emitted URL was guaranteed to 403
   * SignatureDoesNotMatch against any real bucket, so downloads via this
   * provider could never have worked. This now performs a REAL AWS
   * Signature Version 4 presign for GET using the standard library only
   * (canonical request → string-to-sign → HMAC key-chain), failing closed
   * when AWS credentials are absent.
   *
   * Reference: https://docs.aws.amazon.com/AmazonS3/latest/API/sigv4-query-string-auth.html
   */
  private getSigningCredentials(): { accessKeyId: string; secretAccessKey: string } {
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
    if (!accessKeyId || !secretAccessKey) {
      throw new Error(
        'AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are required to generate signed S3 download URLs'
      );
    }
    return { accessKeyId, secretAccessKey };
  }

  async getSignedDownloadUrl(key: string, expiresInSeconds = 900): Promise<string> {
    // SigV4 presigns are capped at 7 days (604800s) by AWS.
    const expires = Math.min(Math.max(1, Math.floor(expiresInSeconds)), 604800);
    const { accessKeyId, secretAccessKey } = this.getSigningCredentials();

    const now = new Date();
    const amzDate = now
      .toISOString()
      .replace(/[-:]/g, '')
      .replace(/\.\d{3}Z$/, 'Z'); // YYYYMMDDTHHMMSSZ
    const dateStamp = amzDate.slice(0, 8);

    const customDomain = process.env.AWS_S3_CUSTOM_DOMAIN?.replace(/\/+$/, '');
    const host = customDomain ? new URL(customDomain).host : `${this.bucket}.s3.${this.region}.amazonaws.com`;
    const baseUrl = customDomain || `https://${host}`;
    const encodedKey = key.split('/').map(encodeURIComponent).join('/');

    const credentialScope = `${dateStamp}/${this.region}/s3/aws4_request`;

    // Canonical query params must be sorted ascending by name.
    const canonicalQuery = [
      'X-Amz-Algorithm=AWS4-HMAC-SHA256',
      `X-Amz-Credential=${encodeURIComponent(`${accessKeyId}/${credentialScope}`)}`,
      `X-Amz-Date=${amzDate}`,
      `X-Amz-Expires=${expires}`,
      'X-Amz-SignedHeaders=host',
    ].join('&');

    const canonicalRequest = [
      'GET',
      `/${encodedKey}`,
      canonicalQuery,
      `host:${host}`,
      '',
      'host',
      'UNSIGNED-PAYLOAD',
    ].join('\n');

    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amzDate,
      credentialScope,
      crypto.createHash('sha256').update(canonicalRequest, 'utf8').digest('hex'),
    ].join('\n');

    const hmac = (signingKey: Buffer | string, data: string) =>
      crypto.createHmac('sha256', signingKey).update(data, 'utf8').digest();
    const kDate = hmac(`AWS4${secretAccessKey}`, dateStamp);
    const kRegion = hmac(kDate, this.region);
    const kService = hmac(kRegion, 's3');
    const kSigning = hmac(kService, 'aws4_request');
    const signature = crypto
      .createHmac('sha256', kSigning)
      .update(stringToSign, 'utf8')
      .digest('hex');

    return `${baseUrl}/${encodedKey}?${canonicalQuery}&X-Amz-Signature=${signature}`;
  }

  getProviderName(): string {
    return 's3';
  }
}
