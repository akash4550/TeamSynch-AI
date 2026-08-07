import { Router } from 'express';
import multer from 'multer';
import { DocumentController } from './document.controller';
import { requireAuth } from '../../core/middlewares/authMiddleware';
import { requirePermission } from '../../core/middlewares/rbacMiddleware';
import { asyncWrapper } from '../../core/utils/asyncWrapper';
import { requireStorageEntitlement } from '../../core/middlewares/requireEntitlement';
import { PERMISSIONS } from '../../core/auth/permissions';

const router = Router();
const controller = new DocumentController();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
});

router.use(requireAuth);

/*
 * BUG FIX (#46): every handler is now asyncWrapper-wrapped — the controller
 * no longer self-catches (see document.controller.ts), so rejections must
 * be forwarded to errorMiddleware to keep the standard error envelope.
 */
// BUG FIX (#55): plan storage quota enforced post-multer (so the incoming
// file size is projected) — was the last un-enforced PlanQuota; uploads by
// over-quota orgs now receive an honest 403 upgrade message instead of
// silently succeeding past the fabricated-limit usage bar.
router.post(
  '/',
  requirePermission(PERMISSIONS.DOCUMENT.CREATE),
  upload.single('file'),
  requireStorageEntitlement(),
  asyncWrapper(controller.upload.bind(controller))
);

router.post(
  '/:id/version',
  requirePermission(PERMISSIONS.DOCUMENT.CREATE),
  upload.single('file'),
  requireStorageEntitlement(),
  asyncWrapper(controller.uploadVersion.bind(controller))
);

router.post(
  '/:id/restore/:versionNumber',
  requirePermission(PERMISSIONS.DOCUMENT.UPDATE),
  asyncWrapper(controller.restoreVersion.bind(controller))
);

router.get(
  '/',
  requirePermission(PERMISSIONS.DOCUMENT.READ),
  asyncWrapper(controller.getAll.bind(controller))
);

router.get(
  '/:id',
  requirePermission(PERMISSIONS.DOCUMENT.READ),
  asyncWrapper(controller.getOne.bind(controller))
);

router.get(
  '/:id/versions',
  requirePermission(PERMISSIONS.DOCUMENT.READ),
  asyncWrapper(controller.getVersions.bind(controller))
);

router.patch(
  '/:id/rename',
  requirePermission(PERMISSIONS.DOCUMENT.UPDATE),
  asyncWrapper(controller.rename.bind(controller))
);

router.patch(
  '/:id/move',
  requirePermission(PERMISSIONS.DOCUMENT.UPDATE),
  asyncWrapper(controller.move.bind(controller))
);

router.delete(
  '/:id',
  requirePermission(PERMISSIONS.DOCUMENT.DELETE),
  asyncWrapper(controller.delete.bind(controller))
);

export default router;
