import { IStorageProvider } from './IStorageProvider';
import { LocalStorageProvider } from './LocalStorageProvider';
import { S3StorageProvider } from './S3StorageProvider';

export class StorageFactory {
  static getProvider(): IStorageProvider {
    const provider = process.env.STORAGE_PROVIDER || 'local';
    if (provider.toLowerCase() === 's3') {
      return new S3StorageProvider();
    }
    return new LocalStorageProvider();
  }
}
