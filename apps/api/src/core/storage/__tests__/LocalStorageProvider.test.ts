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
    // Bug #64: URLs resolve through /api/v1/uploads (served, HMAC-gated) —
    // the old bare '/uploads/...' prefix resolved nowhere at all.
    expect(result.url).toBe(`/api/v1/uploads/${result.key}`);
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

  /*
   * Bug #60 contract: download URLs are HMAC-SHA256 signed (not the old
   * reversible base64 pseudo-signature) and verify via verifySignedDownloadUrl.
   */
  it('signs download URLs that verify round-trip and reject forgery', async () => {
    const url = await provider.getSignedDownloadUrl('org_123/exports/audit.csv', 3600);
    const parsed = new URL(url, 'http://localhost');
    const expires = parsed.searchParams.get('expires')!;
    const sig = parsed.searchParams.get('sig')!;

    // Absolute epoch-ms expiry, 43-char base64url HMAC — and crucially the
    // legacy forgery channel is gone: base64-DECODING the sig must not
    // reveal the key scheme.
    expect(Number(expires)).toBeGreaterThan(Date.now());
    expect(sig).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(sig, 'base64url').toString()).not.toContain('org_123');

    expect(provider.verifySignedDownloadUrl('org_123/exports/audit.csv', expires, sig)).toBe(true);
    // Tampered key: same sig must not authorize any other key.
    expect(provider.verifySignedDownloadUrl('org_999/other/file.pdf', expires, sig)).toBe(false);
    // Tampered (extended) expiry: payload differs, sig mismatch.
    expect(provider.verifySignedDownloadUrl('org_123/exports/audit.csv', Number(expires) + 3_600_000, sig)).toBe(false);
    // Legacy base64 pseudo-signature of the old `key:expiry` scheme is rejected.
    const legacyForgery = Buffer.from(`org_123/exports/audit.csv:${expires}`).toString('base64url');
    expect(provider.verifySignedDownloadUrl('org_123/exports/audit.csv', expires, legacyForgery)).toBe(false);
    // Already-expired deadline is rejected.
    expect(provider.verifySignedDownloadUrl('org_123/exports/audit.csv', Date.now() - 1, sig)).toBe(false);
  });
});
