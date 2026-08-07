import { NextFunction, Request, Response } from 'express';
import { AppError } from '../errors/AppError';
import { LocalStorageProvider } from './LocalStorageProvider';
import { StorageFactory } from './StorageFactory';

/*
 * BUG FIX (#64 — signed download URLs resolved nowhere: every download the
 * API hands out 404'd). document.service embeds
 * `/uploads/<key>?expires=...&sig=...` URLs in SIX response paths (upload,
 * versions, restore, move, rename, list), the audit-export processor emits
 * a 1-hour pre-signed URL over the `audit.export.completed` socket event,
 * and the web app navigates to both (DocumentsPage card/row clicks,
 * AuditLogViewerPage window.open) — but NO route ever served /uploads, so
 * document viewing/downloading and the compliance CSV export were 100%
 * broken: every click opened a blank 404 tab. The #51/#60 review only
 * hardened the signature; nothing closed the serving loop.
 *
 * This handler closes it for the LOCAL provider, and ONLY through the HMAC
 * gate added in #60: the signed URL is the authorization credential (a
 * browser `window.open` cannot attach Authorization headers — that is the
 * entire point of pre-signed URLs), so requests are authenticated by
 * verifySignedDownloadUrl, never by session. Anything unverifiable —
 * missing/bad/expired signature, traversal-shaped key — is a uniform 403,
 * and bytes are streamed strictly as `application/octet-stream` attachments
 * so a malicious stored file can never execute in the tenant origin (kills
 * the stored-XSS class by construction). In S3 mode nothing should hit this
 * path (S3 URLs are absolute and presigned by AWS): 404.
 */
export const signedDownloadHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const provider = StorageFactory.getProvider();
    if (!(provider instanceof LocalStorageProvider)) {
      throw new AppError('Not found', 404);
    }

    // The URL producer encodes each key segment separately; decode the same
    // way so normalization in verify/read sees identical input.
    const key = req.path
      .replace(/^\//, '')
      .split('/')
      .map(decodeURIComponent)
      .join('/');

    const expires = String(req.query.expires ?? '');
    const signature = String(req.query.sig ?? '');

    if (!provider.verifySignedDownloadUrl(key, expires, signature)) {
      throw new AppError('Invalid or expired download link', 403);
    }

    let buffer: Buffer;
    try {
      buffer = await provider.getFileBuffer(key);
    } catch {
      // A validly-signed URL whose bytes were removed (or never landed):
      // honest 404, not a generic 500.
      throw new AppError('Not found', 404);
    }

    const fileName = key.split('/').pop() || 'download';

    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName.replace(/[^\w.\-]/g, '_')}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(buffer);
  } catch (error) {
    next(error);
  }
};
