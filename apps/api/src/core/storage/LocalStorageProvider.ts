import fs from 'fs';
import path from 'path';
import { IStorageProvider, StorageFilePayload, UploadResult } from './IStorageProvider';
import { v4 as uuidv4 } from 'uuid';

export class LocalStorageProvider implements IStorageProvider {
  private baseUploadDir: string;

  constructor() {
    this.baseUploadDir = path.join(process.cwd(), 'uploads');
    if (!fs.existsSync(this.baseUploadDir)) {
      fs.mkdirSync(this.baseUploadDir, { recursive: true });
    }
  }

  async uploadFile(file: StorageFilePayload, pathPrefix: string): Promise<UploadResult> {
    const ext = path.extname(file.originalname);
    const fileName = `${uuidv4()}${ext}`;
    const storageKey = path.join(pathPrefix, fileName);

    const targetDir = path.join(this.baseUploadDir, pathPrefix);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const targetPath = path.join(targetDir, fileName);

    if (file.buffer) {
      fs.writeFileSync(targetPath, file.buffer);
    } else if (file.path) {
      fs.copyFileSync(file.path, targetPath);
      fs.unlinkSync(file.path);
    } else {
      throw new Error('No file buffer or path provided in payload');
    }

    const url = `/uploads/${storageKey.replace(/\\/g, '/')}`;

    return {
      key: storageKey,
      url,
      size: file.size,
      mimeType: file.mimetype,
    };
  }

  async deleteFile(key: string): Promise<boolean> {
    try {
      const targetPath = path.join(this.baseUploadDir, key);
      if (fs.existsSync(targetPath)) {
        fs.unlinkSync(targetPath);
      }
      return true;
    } catch (e) {
      console.error('Failed to delete file', e);
      return false;
    }
  }

  async getFileUrl(key: string): Promise<string> {
    return `/uploads/${key.replace(/\\/g, '/')}`;
  }

  async getSignedDownloadUrl(key: string, expiresInSeconds = 900): Promise<string> {
    const signature = Buffer.from(`${key}:${Date.now() + expiresInSeconds * 1000}`).toString('base64url');
    return `/uploads/${key.replace(/\\/g, '/')}?expires=${expiresInSeconds}&sig=${signature}`;
  }

  getProviderName(): string {
    return 'local';
  }
}
