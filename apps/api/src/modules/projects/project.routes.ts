import { Router } from 'express';
import { ProjectController } from './project.controller';
import { requireAuth } from '../../core/middlewares/authMiddleware';
import { requirePermission } from '../../core/middlewares/rbacMiddleware';
import { requireEntitlement } from '../../core/middlewares/requireEntitlement';
import { validateRequest } from '../../core/middlewares/validateRequest';
import {
  createProjectSchema,
  updateProjectSchema,
  getProjectSchema,
  deleteProjectSchema,
  projectListSchema,
} from './project.validator';
import { PROJECT_PERMISSIONS } from './project.permissions';

const router = Router();
const controller = new ProjectController();

router.use(requireAuth);

router.get(
  '/',
  requirePermission(PROJECT_PERMISSIONS.READ),
  /*
   * BUG FIX (#113, 2026-08-06): projectListSchema existed in
   * project.validator.ts — fully written (coerced page, ≤500 limit cap,
   * status/sortBy enums, strict keys) — but this route NEVER mounted it,
   * and the controller read raw req.query: the only list endpoint besides
   * documents (#112) where garbage sorts/pages answered an opaque 500
   * (PrismaClientValidationError) and ?limit=99999999 bypassed the cap
   * the schema advertises. Wire it exactly like every sibling route.
   */
  validateRequest(projectListSchema),
  controller.getProjects
);

router.get(
  '/:id',
  requirePermission(PROJECT_PERMISSIONS.READ),
  validateRequest(getProjectSchema),
  controller.getProjectById
);

router.post(
  '/',
  requirePermission(PROJECT_PERMISSIONS.CREATE),
  requireEntitlement('PROJECT'),
  validateRequest(createProjectSchema),
  controller.createProject
);

router.patch(
  '/:id',
  requirePermission(PROJECT_PERMISSIONS.UPDATE),
  validateRequest(updateProjectSchema),
  controller.updateProject
);

router.patch(
  '/:id/archive',
  requirePermission(PROJECT_PERMISSIONS.UPDATE),
  validateRequest(getProjectSchema),
  controller.archiveProject
);

router.patch(
  '/:id/restore',
  requirePermission(PROJECT_PERMISSIONS.UPDATE),
  validateRequest(getProjectSchema),
  controller.restoreProject
);

router.delete(
  '/:id',
  requirePermission(PROJECT_PERMISSIONS.DELETE),
  validateRequest(deleteProjectSchema),
  controller.deleteProject
);

export default router;
