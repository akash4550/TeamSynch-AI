import { Router } from 'express';
import multer from 'multer';
import { DocumentController } from './document.controller';
import { requireAuth } from '../../core/middlewares/authMiddleware';
import { requirePermission } from '../../core/middlewares/rbacMiddleware';
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

router.post(
  '/',
  requirePermission(PERMISSIONS.DOCUMENT.CREATE),
  upload.single('file'),
  controller.upload.bind(controller)
);

router.post(
  '/:id/version',
  requirePermission(PERMISSIONS.DOCUMENT.CREATE),
  upload.single('file'),
  controller.uploadVersion.bind(controller)
);

router.post(
  '/:id/restore/:versionNumber',
  requirePermission(PERMISSIONS.DOCUMENT.UPDATE),
  controller.restoreVersion.bind(controller)
);

router.get(
  '/',
  requirePermission(PERMISSIONS.DOCUMENT.READ),
  controller.getAll.bind(controller)
);

router.get(
  '/:id',
  requirePermission(PERMISSIONS.DOCUMENT.READ),
  controller.getOne.bind(controller)
);

router.get(
  '/:id/versions',
  requirePermission(PERMISSIONS.DOCUMENT.READ),
  controller.getVersions.bind(controller)
);

router.patch(
  '/:id/rename',
  requirePermission(PERMISSIONS.DOCUMENT.UPDATE),
  controller.rename.bind(controller)
);

router.patch(
  '/:id/move',
  requirePermission(PERMISSIONS.DOCUMENT.UPDATE),
  controller.move.bind(controller)
);

router.delete(
  '/:id',
  requirePermission(PERMISSIONS.DOCUMENT.DELETE),
  controller.delete.bind(controller)
);

export default router;
