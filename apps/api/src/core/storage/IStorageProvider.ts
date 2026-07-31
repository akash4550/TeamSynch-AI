export interface UploadResult {
  key: string;
  url: string;
  size: number;
  mimeType: string;
}

export interface StorageFilePayload {
  originalname: string;
  mimetype: string;
  size: number;
  buffer?: Buffer;
}

export interface IStorageProvider {
  uploadFile(file: StorageFilePayload, pathPrefix: string): Promise<UploadResult>;
  deleteFile(key: string): Promise<boolean>;
  getFileUrl(key: string): Promise<string>;
  getSignedDownloadUrl(key: string, expiresInSeconds?: number): Promise<string>;
  getProviderName(): string;
}
