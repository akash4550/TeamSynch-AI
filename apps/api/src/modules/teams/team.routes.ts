import { Router } from 'express';

import { TeamController } from './team.controller';

import { requireAuth } from '../../core/middlewares/authMiddleware';

import { requirePermission } from '../../core/middlewares/rbacMiddleware';

import { PERMISSIONS } from '../../core/auth/permissions';

import { validateRequest } from '../../core/middlewares/validateRequest';

import {
  createTeamSchema,
  updateTeamSchema,
  inviteMemberSchema,
  updateMembershipSchema,
  getTeamSchema,
  deleteTeamSchema,
  listTeamsSchema,
} from './team.validator';



const router = Router();

const controller = new TeamController();



router.use(requireAuth);




// Team listing

router.get(

  '/my-teams',

  requirePermission(PERMISSIONS.TEAM.READ),

  controller.getMyTeams

);



router.get(

  '/',

  requirePermission(PERMISSIONS.TEAM.READ),

  validateRequest(listTeamsSchema),

  controller.getTeams

);





router.get(

  '/:id',

  requirePermission(PERMISSIONS.TEAM.READ),

  validateRequest(getTeamSchema),

  controller.getTeamById

);







// Team creation

router.post(

  '/',

  requirePermission(PERMISSIONS.TEAM.MANAGE),

  validateRequest(createTeamSchema),

  controller.createTeam

);







// Team update

router.patch(

  '/:id',

  requirePermission(PERMISSIONS.TEAM.MANAGE),

  validateRequest(updateTeamSchema),

  controller.updateTeam

);







router.delete(

  '/:id',

  requirePermission(PERMISSIONS.TEAM.MANAGE),

  validateRequest(deleteTeamSchema),

  controller.deleteTeam

);








// Members


router.get(

  '/:id/members',

  requirePermission(PERMISSIONS.TEAM.READ),

  validateRequest(getTeamSchema),

  controller.getMembers

);





router.patch(

  '/:id/members/:userId',

  requirePermission(PERMISSIONS.TEAM.MANAGE),

  validateRequest(updateMembershipSchema),

  controller.updateMembership

);





router.delete(

  '/:id/members/:userId',

  requirePermission(PERMISSIONS.TEAM.MANAGE),

  controller.removeMember

);








// Invitations


router.get(
  '/:id/invitations',
  requirePermission(PERMISSIONS.TEAM.MANAGE),
  validateRequest(getTeamSchema),
  controller.getInvitations
);

router.post(

  '/:id/invitations',

  requirePermission(PERMISSIONS.TEAM.MANAGE),

  validateRequest(inviteMemberSchema),

  controller.inviteMember

);



export default router;