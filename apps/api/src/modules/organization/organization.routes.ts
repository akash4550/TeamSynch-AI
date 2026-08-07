import { Router } from 'express';
import multer from 'multer';
import { OrganizationController } from './organization.controller';
import { requireAuth } from '../../core/middlewares/authMiddleware';
import { requireRole } from '../../core/middlewares/rbacMiddleware';
import { validateRequest } from '../../core/middlewares/validateRequest';
import { updateOrganizationSchema } from './organization.validator';
import { asyncWrapper } from '../../core/utils/asyncWrapper';

const router = Router();
const controller = new OrganizationController();

// Logos are small profile images — memory storage (same pattern as the
// documents module) with a tight 2MB ceiling.
const logoUpload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 2 * 1024 * 1024,
    },
});

/*
 * FEATURE (ledger #8 — public logo rendering): this route is PUBLIC by
 * design and must stay mounted BEFORE `router.use(requireAuth)` — <img>
 * elements cannot attach Authorization headers, so a session-gated logo
 * route could never render in the UI. Exposure is limited to the org's own
 * raster logo bytes (or a redirect to them); the service enforces the
 * `org_<id>/logo/` key namespace so the route cannot proxy other tenants'
 * stored objects. Same mount-ordering precedent as the ledger-#1 public
 * invitation accept routes in app.ts.
 */
router.get('/:id/logo', asyncWrapper(controller.getPublicLogo));

router.use(requireAuth);

router.get('/', asyncWrapper(controller.getOrganization));

// Wire for the OrganizationSettings "Upload New Logo" button (previously
// dead — no endpoint existed): stores the file via the shared storage
// provider and persists its URL on the organization.
router.post(
    '/logo',
    requireRole('SUPER_ADMIN', 'ADMIN'),
    logoUpload.single('logo'),
    asyncWrapper(controller.uploadLogo)
);

router.patch(
    '/',
    requireRole('SUPER_ADMIN', 'ADMIN'),
    validateRequest(updateOrganizationSchema),
    asyncWrapper(controller.updateOrganization)
);

export default router;
