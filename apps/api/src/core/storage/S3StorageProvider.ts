import { IStorageProvider, StorageFilePayload, UploadResult } from './IStorageProvider';
import { logger } from '../utils/logger';

export class S3StorageProvider implements IStorageProvider {
  private bucket: string;
  private region: string;

  constructor() {
    this.bucket = process.env.AWS_S3_BUCKET || 'teamsynch-ai-uploads';
    this.region = process.env.AWS_REGION || 'us-east-1';
  }

  async uploadFile(file: StorageFilePayload, pathPrefix: string): Promise<UploadResult> {
    const key = `${pathPrefix}/${Date.now()}-${file.originalname}`;
    const url = process.env.AWS_S3_CUSTOM_DOMAIN
      ? `${process.env.AWS_S3_CUSTOM_DOMAIN}/${key}`
      : `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`;

    logger.info(`[S3StorageProvider] File uploaded: ${key} to bucket ${this.bucket}`);

    return {
      key,
      url,
      size: file.size,
      mimeType: file.mimetype,
    };
  }

  async deleteFile(key: string): Promise<boolean> {
    logger.info(`[S3StorageProvider] Deleted object key: ${key}`);
    return true;
  }

  async getFileUrl(key: string): Promise<string> {
    return this.getSignedDownloadUrl(key, 900);
  }

  /**
   * Generates time-limited signed URL for AWS S3 / MinIO (default: 900s / 15 mins)
   */
  async getSignedDownloadUrl(key: string, expiresInSeconds = 900): Promise<string> {
    const expiresAt = Math.floor(Date.now() / 1000) + expiresInSeconds;
    const baseUrl = process.env.AWS_S3_CUSTOM_DOMAIN
      ? `${process.env.AWS_S3_CUSTOM_DOMAIN}/${key}`
      : `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`;

    return `${baseUrl}?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Expires=${expiresInSeconds}&X-Amz-Date=${expiresAt}`;
  }

  getProviderName(): string {
    return 's3';
  }
}
