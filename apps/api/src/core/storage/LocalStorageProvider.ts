import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
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

  private toPublicUrl(storageKey: string): string {
    const normalizedKey = this.normalizeStorageKey(storageKey, 'storage key');
    const encodedKey = normalizedKey.split('/').map(encodeURIComponent).join('/');
    return `/uploads/${encodedKey}`;
  }

  async uploadFile(file: StorageFilePayload, pathPrefix: string): Promise<UploadResult> {
    const normalizedPrefix = this.normalizeStorageKey(pathPrefix, 'storage path prefix');
    const candidateExtension = path.extname(file.originalname);
    const extension = SAFE_EXTENSION.test(candidateExtension) ? candidateExtension.toLowerCase() : '';
    const fileName = `${uuidv4()}${extension}`;
    const storageKey = `${normalizedPrefix}/${fileName}`;

    const targetDir = this.resolveStoragePath(normalizedPrefix);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const targetPath = this.resolveStoragePath(storageKey);

    if (file.buffer) {
      fs.writeFileSync(targetPath, file.buffer);
    } else if (file.path) {
      fs.copyFileSync(file.path, targetPath);
      fs.unlinkSync(file.path);
    } else {
      throw new Error('No file buffer or path provided in payload');
    }

    return {
      key: storageKey,
      url: this.toPublicUrl(storageKey),
      size: file.size,
      mimeType: file.mimetype,
    };
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

  async getSignedDownloadUrl(key: string, expiresInSeconds = 900): Promise<string> {
    const normalizedKey = this.normalizeStorageKey(key, 'storage key');
    const signature = Buffer.from(
      `${normalizedKey}:${Date.now() + expiresInSeconds * 1000}`,
    ).toString('base64url');

    return `${this.toPublicUrl(normalizedKey)}?expires=${expiresInSeconds}&sig=${signature}`;
  }

  getProviderName(): string {
    return 'local';
  }
}
