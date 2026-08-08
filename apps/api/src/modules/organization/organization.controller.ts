import { Request, Response } from 'express';
import { AppError } from '../../core/errors/AppError';
import { OrganizationService } from './organization.service';
import { LocalStorageProvider } from '../../core/storage/LocalStorageProvider';
import { getValidatedRequest } from '../../core/middlewares/validateRequest';
import { UpdateOrganizationRequest } from './organization.validator';

export class OrganizationController {
    private service: OrganizationService;

    constructor() {
        this.service = new OrganizationService();
    }

    getOrganization = async (req: Request, res: Response) => {
        const organizationId = req.user!.organizationId;
        const organization = await this.service.getOrganization(organizationId);
        res.status(200).json({ success: true, data: organization });
    };

    updateOrganization = async (req: Request, res: Response) => {
        const organizationId = req.user!.organizationId;
        const { body } = getValidatedRequest<UpdateOrganizationRequest>(req);
        const updatedOrganization = await this.service.updateOrganization(organizationId, body);
        res.status(200).json({ success: true, data: updatedOrganization });
    };

    // POST /organizations/logo — multipart `logo` field (PNG/JPEG/WebP, ≤2MB).
    // Wired for the OrganizationSettings "Upload New Logo" button, which was
    // previously dead: it uploads via the shared storage provider and returns
    // the persisted URL.
    uploadLogo = async (req: Request, res: Response) => {
        const organizationId = req.user!.organizationId;
        const file = req.file;

        // BUG FIX (#46): was `{ error: string }` off-contract reply — throw so
        // errorMiddleware emits the standard envelope the web extractor reads.
        if (!file) {
            throw new AppError('No logo file provided', 400);
        }

        const { logoUrl } = await this.service.updateOrganizationLogo(
            organizationId,
            {
                originalname: file.originalname,
                mimetype: file.mimetype,
                size: file.size,
                buffer: file.buffer,
            }
        );

        res.status(200).json({ success: true, data: { logoUrl } });
    };

    /*
     * FEATURE (ledger #8 — public logo rendering): GET /organizations/:id/logo.
     * Public by design (mounted before requireAuth — <img> tags cannot send
     * Authorization headers). `local` descriptors stream bytes through
     * LocalStorageProvider directly: value-format dispatch means local-format
     * stored URLs are served from disk even when the configured provider is
     * S3 (post-migration honest degradation to 404 if the bytes are gone).
     * Responses are cacheable for 5 minutes; the web app cache-busts with a
     * `?v=` seed derived from the stored reference, which changes per upload.
     */
    private localLogoProvider = new LocalStorageProvider();

    getPublicLogo = async (req: Request, res: Response) => {
        // Express 5 types `:id` params as string | string[]; the route only
        // ever matches a single segment, so narrow explicitly.
        const organizationId = String(req.params.id);
        const descriptor = await this.service.getPublicLogoDescriptor(organizationId);

        if (descriptor.kind === 'redirect') {
            res.redirect(302, descriptor.url);
            return;
        }

        if (descriptor.kind === 'database') {
            res.setHeader('Content-Type', descriptor.contentType);
            res.setHeader('Content-Length', descriptor.buffer.length);
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
            res.setHeader('ETag', `"${descriptor.etag}"`);
            res.setHeader('X-Content-Type-Options', 'nosniff');
            res.send(descriptor.buffer);
            return;
        }

        let buffer: Buffer;
        try {
            buffer = await this.localLogoProvider.getFileBuffer(descriptor.key);
        } catch {
            // Bytes missing on disk (removed out-of-band, or a local→S3
            // migration left the row behind): honest 404, same stance as the
            // signed-download handler.
            throw new AppError('Not found', 404);
        }

        res.setHeader('Content-Type', descriptor.contentType);
        res.setHeader('Content-Length', buffer.length);
        res.setHeader('Cache-Control', 'public, max-age=300');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.send(buffer);
    };
}
