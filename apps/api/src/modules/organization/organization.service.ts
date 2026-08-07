import { OrganizationRepository } from './organization.repository';
import { UpdateOrganizationDto } from './organization.dto';
import { AppError } from '../../core/errors/AppError';
import { StorageFactory } from '../../core/storage/StorageFactory';
import { S3StorageProvider } from '../../core/storage/S3StorageProvider';
import { IStorageProvider, StorageFilePayload } from '../../core/storage/IStorageProvider';

export type PublicLogoDescriptor =
    | { kind: 'local'; key: string; contentType: string }
    | { kind: 'redirect'; url: string };

export class OrganizationService {
    private repository: OrganizationRepository;
    private storageProvider: IStorageProvider;

    constructor() {
        this.repository = new OrganizationRepository();
        this.storageProvider = StorageFactory.getProvider();
    }

    async getOrganization(organizationId: string) {
        const org = await this.repository.findById(organizationId);
        if (!org) {
            throw new AppError('Organization not found', 404);
        }
        return org;
    }

    /*
     * FEATURE (ledger #8 — 2026-08-05): public logo rendering. The settings
     * preview `<img src={storedValue}>` could NEVER display anything: under
     * the local provider the stored value is an unsigned `/api/v1/uploads/…`
     * path and that mount rejects unsigned requests (HMAC gate, #60) — and
     * even a signed one would force-download (`attachment`, octet-stream);
     * under S3 the stored value is a virtual-hosted URL that 403s against
     * any non-public bucket. Since `<img>` cannot carry Authorization
     * headers, rendering requires a PUBLIC route; this descriptor resolves
     * the stored value to what the controller should do with it.
     *
     * Dispatch is VALUE-FORMAT driven, never current-provider driven, so
     * logos uploaded before a local→S3 (or reverse) migration keep working:
     *   - `/api/v1/uploads/<key>`      → bytes live in local storage →
     *     `{ kind: 'local' }` (controller streams via LocalStorageProvider;
     *     pre-#64 bare `/uploads/…` rows were never servable and stay an
     *     honest 404, matching the #64 stance);
     *   - `<bucket>.s3.<region>.amazonaws.com` or AWS_S3_CUSTOM_DOMAIN URL
     *     → `{ kind: 'redirect' }` to a FRESH SigV4 presign (ledger-#60
     *     crypto) — the 302 target is minted per request, so it never sits
     *     in the DB expiring;
     *   - any other `https://` URL (foreign CDN set via the PATCH logo
     *     field) → 302 passthrough to the stored absolute URL;
     *   - anything else (`data:`, `file:`, unknown extension, …) → 404.
     *
     * CONFUSED-DEPUTY GUARD: the PATCH schema accepts a free-form `logo`
     * URL, so an org admin could point it at `/api/v1/uploads/<another
     * tenant>/audit_exports/….csv` and use this public route as an exfil
     * proxy. Derived storage keys are therefore only served when they sit
     * inside the requesting org's own logo namespace
     * (`org_<id>/logo/` — the only prefix updateOrganizationLogo writes).
     */
    private static readonly LOCAL_LOGO_PREFIX = '/api/v1/uploads/';
    private static readonly LOGO_CONTENT_TYPES: Record<string, string> = {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.webp': 'image/webp',
    };

    private logoContentType(key: string): string {
        const ext = (key.match(/\.[a-z0-9]+$/i)?.[0] || '').toLowerCase();
        const contentType = OrganizationService.LOGO_CONTENT_TYPES[ext];
        if (!contentType) {
            // Only raster upload-validated formats are renderable inline;
            // anything else is an honest 404, not a broken-image byte dump.
            throw new AppError('Logo format not supported for inline rendering', 404);
        }
        return contentType;
    }

    private decodeStoredKey(encodedKey: string): string {
        // Mirrors LocalStorageProvider.toPublicUrl: segments were encoded
        // individually, so decode them individually.
        return encodedKey.split('/').map(decodeURIComponent).join('/');
    }

    private assertKeyInLogoNamespace(organizationId: string, key: string) {
        if (!key.startsWith(`org_${organizationId}/logo/`)) {
            // Uniform 404: never reveal that a key exists outside the
            // requester's own logo namespace (anti confused-deputy).
            throw new AppError('Organization logo not found', 404);
        }
    }

    async getPublicLogoDescriptor(
        organizationId: string
    ): Promise<PublicLogoDescriptor> {
        const org = await this.repository.findById(organizationId);
        if (!org) {
            throw new AppError('Organization not found', 404);
        }
        if (!org.logo) {
            throw new AppError('Organization has no logo', 404);
        }

        const stored = org.logo;

        if (stored.startsWith(OrganizationService.LOCAL_LOGO_PREFIX)) {
            const key = this.decodeStoredKey(
                stored.slice(OrganizationService.LOCAL_LOGO_PREFIX.length)
            );
            this.assertKeyInLogoNamespace(organizationId, key);
            return { kind: 'local', key, contentType: this.logoContentType(key) };
        }

        const bucket = process.env.AWS_S3_BUCKET;
        const region = process.env.AWS_REGION || 'us-east-1';
        const s3Prefixes = [
            bucket ? `https://${bucket}.s3.${region}.amazonaws.com/` : null,
            process.env.AWS_S3_CUSTOM_DOMAIN
                ? `${process.env.AWS_S3_CUSTOM_DOMAIN.replace(/\/+$/, '')}/`
                : null,
        ].filter((p): p is string => Boolean(p));

        for (const prefix of s3Prefixes) {
            if (stored.startsWith(prefix)) {
                const key = this.decodeStoredKey(stored.slice(prefix.length));
                this.assertKeyInLogoNamespace(organizationId, key);
                // Mint per request: the redirect target is a fresh SigV4
                // presign, so no expiring URL is ever persisted. Missing AWS
                // credentials surface as the #60-style named-env error.
                const signedUrl = await new S3StorageProvider().getSignedDownloadUrl(key, 3600);
                return { kind: 'redirect', url: signedUrl };
            }
        }

        // Legacy/foreign absolute references only ever redirect; schemes
        // other than https are refused outright (no data:/file:/javascript:).
        if (/^https:\/\//i.test(stored)) {
            return { kind: 'redirect', url: stored };
        }

        throw new AppError('Unsupported stored logo reference', 404);
    }

    async updateOrganization(organizationId: string, data: UpdateOrganizationDto) {
        if (data.slug) {
            const existing = await this.repository.findBySlug(data.slug);
            if (existing && existing.id !== organizationId) {
                throw new AppError('Slug is already taken by another organization', 400);
            }
        }

        const organization = await this.repository.update(organizationId, data);
        if (!organization) {
            throw new AppError('Organization not found', 404);
        }

        return organization;
    }

    // Raster formats only — SVG is intentionally excluded because serving
    // user-supplied markup as an image is an XSS vector on other tenants.
    private static readonly ALLOWED_LOGO_MIME_TYPES = new Set([
        'image/png',
        'image/jpeg',
        'image/webp',
    ]);

    /*
     * Supports the OrganizationSettings "Upload New Logo" flow (previously a
     * dead button): persists the file through the shared storage provider
     * (local disk in dev, S3 in prod) and stores the resulting URL on the
     * organization row, exactly like the PATCH route's `logo` field expects.
     */
    async updateOrganizationLogo(
        organizationId: string,
        file: StorageFilePayload
    ) {
        if (!file.buffer || file.buffer.length === 0) {
            throw new AppError('Logo image is required', 400);
        }

        if (!OrganizationService.ALLOWED_LOGO_MIME_TYPES.has(file.mimetype)) {
            throw new AppError(
                'Logo must be a PNG, JPEG, or WebP image',
                400
            );
        }

        // Confirm the org exists before touching storage so a bad tenant
        // never leaves orphan files behind.
        await this.getOrganization(organizationId);

        const uploadResult = await this.storageProvider.uploadFile(
            file,
            `org_${organizationId}/logo`
        );

        await this.repository.update(organizationId, {
            logo: uploadResult.url,
        });

        return { logoUrl: uploadResult.url };
    }
}
