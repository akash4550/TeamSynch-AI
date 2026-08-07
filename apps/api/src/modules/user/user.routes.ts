import { Router } from 'express';

import { UserController } from './user.controller';

import { requireAuth } from '../../core/middlewares/authMiddleware';

import { requirePermission } from '../../core/middlewares/rbacMiddleware';

import { validateRequest } from '../../core/middlewares/validateRequest';

import {
  createUserSchema,
  updateOwnProfileSchema,
  updateUserSchema,
  updateUserRoleSchema,
  updateUserStatusSchema,
  deleteUserSchema,
  getUserSchema,
  listUsersSchema,
} from './user.validator';

import { requireEntitlement } from '../../core/middlewares/requireEntitlement';

import { PERMISSIONS } from '../../core/auth/permissions';



const router = Router();

const controller = new UserController();




// Authentication required for all user routes

router.use(requireAuth);





router.get(

  '/',

  requirePermission(PERMISSIONS.USER.READ),

  validateRequest(listUsersSchema),

  controller.getUsers

);





router.get(

  '/:id',

  requirePermission(PERMISSIONS.USER.READ),

  validateRequest(getUserSchema),

  controller.getUserById

);





/*

 * BUG FIX (#49 — USER plan quota never enforced): EntitlementService fully
 * implements the per-plan `maxUsers` gate (FREE=5, STARTER=15, PRO=50,
 * BUSINESS=500) and the usage bars on SubscriptionSettingsPage read the
 * same counts — but `requireEntitlement` was mounted ONLY on
 * POST /projects, so POST /users skirted the limit entirely: a FREE org
 * could create unlimited seats while the billing page displayed
 * fabricated-limit usage bars (the counters worked; the gate just never
 * ran). Mirrors the exact chain order of project.routes.ts.
 */
router.post(

  '/',

  requirePermission(PERMISSIONS.USER.CREATE),

  requireEntitlement('USER'),

  validateRequest(createUserSchema),

  controller.createUser

);





router.patch(

  '/me',

  validateRequest(updateOwnProfileSchema),

  controller.updateOwnProfile

);






router.patch(

  '/:id',

  requirePermission(PERMISSIONS.USER.UPDATE),

  validateRequest(updateUserSchema),

  controller.updateUser

);





router.patch(

  '/:id/role',

  requirePermission(PERMISSIONS.USER.UPDATE),

  validateRequest(updateUserRoleSchema),

  controller.updateUserRole

);






router.patch(

  '/:id/status',

  requirePermission(PERMISSIONS.USER.UPDATE),

  validateRequest(updateUserStatusSchema),

  controller.updateUserStatus

);





router.delete(

  '/:id',

  requirePermission(PERMISSIONS.USER.DELETE),

  validateRequest(deleteUserSchema),

  controller.deleteUser

);




export default router;
