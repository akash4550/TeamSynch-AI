import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { LocalStorageProvider } from '../LocalStorageProvider';

describe('LocalStorageProvider', () => {
  const originalWorkingDirectory = process.cwd();
  let temporaryDirectory: string;
  let provider: LocalStorageProvider;

  beforeEach(() => {
    temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'teamsynch-storage-'));
    process.chdir(temporaryDirectory);
    provider = new LocalStorageProvider();
  });

  afterEach(() => {
    process.chdir(originalWorkingDirectory);
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  });

  it('stores a buffered file inside the configured upload directory', async () => {
    const result = await provider.uploadFile(
      {
        originalname: 'report.PDF',
        mimetype: 'application/pdf',
        size: 4,
        buffer: Buffer.from('test'),
      },
      'org_123/doc_456',
    );

    expect(result.key).toMatch(/^org_123\/doc_456\/[0-9a-f-]+\.pdf$/);
    expect(result.url).toBe(`/uploads/${result.key}`);
    expect(fs.readFileSync(path.join(temporaryDirectory, 'uploads', ...result.key.split('/')), 'utf8'))
      .toBe('test');
  });

  it.each([
    '../outside',
    'safe/../../outside',
    '/absolute/path',
    'safe//outside',
  ])('rejects unsafe upload path prefix %s', async (pathPrefix) => {
    await expect(
      provider.uploadFile(
        {
          originalname: 'report.txt',
          mimetype: 'text/plain',
          size: 4,
          buffer: Buffer.from('test'),
        },
        pathPrefix,
      ),
    ).rejects.toThrow(/Invalid storage path prefix/);
  });

  it('rejects unsafe keys when creating public URLs', async () => {
    await expect(provider.getFileUrl('../secret.txt')).rejects.toThrow(/Invalid storage key/);
    await expect(provider.getSignedDownloadUrl('safe/../../secret.txt')).rejects.toThrow(
      /Invalid storage key/,
    );
  });

  it('does not delete files addressed by an unsafe key', async () => {
    const protectedFile = path.join(temporaryDirectory, 'protected.txt');
    fs.writeFileSync(protectedFile, 'keep');

    await expect(provider.deleteFile('../protected.txt')).resolves.toBe(false);
    expect(fs.readFileSync(protectedFile, 'utf8')).toBe('keep');
  });
});
