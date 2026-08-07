import { Request, Response } from 'express';

import { TeamService } from './team.service';
import type { ListTeamsRequest } from './team.validator';

import { asyncWrapper } from '../../core/utils/asyncWrapper';
import { getValidatedRequest } from '../../core/middlewares/validateRequest';



export class TeamController {


  private service: TeamService;



  constructor() {

    this.service = new TeamService();

  }







  getTeams = asyncWrapper(

    async (
      req: Request,
      res: Response
    ) => {


      const organizationId =
        req.user!.organizationId;

      /*
       * BUG FIX (#115, 2026-08-06): read the VALIDATED, coerced query —
       * never raw req.query again. Same discarded-validation root as
       * #114 (users): GET /teams mounts validateRequest(listTeamsSchema)
       * (page/limit coerce + defaults, ≤100 cap, sortBy/sortOrder enums),
       * but its output was being discarded while raw string values
       * flowed downstream. Today's live callers (TeamsPage: search only,
       * TeamDashboard: bare) never send page/limit, so the defaults
       * happen to apply — but the FIRST caller to pass ?limit=10 would
       * hit Prisma's Int-typed `take` with the string "10" (client-side
       * argument validation error → 500). The mounted schema advertised
       * pagination the controller never honored. getValidatedRequest
       * answers 500-by-design if the wiring is ever removed, so the
       * bypass cannot silently return. The `{ success, data }` response
       * contract is unchanged.
       */
      const { query } =
        getValidatedRequest<ListTeamsRequest>(req);



      const teams =
        await this.service.getTeams(

          organizationId,

          query

        );



      res.status(200).json({

        success: true,

        data: teams,

      });

    }

  );








  getMyTeams = asyncWrapper(

    async (
      req: Request,
      res: Response
    ) => {


      const teams =
        await this.service.getUserTeams(

          req.user!.organizationId,

          req.user!.id

        );



      res.status(200).json({

        success: true,

        data: teams,

      });

    }

  );








  getTeamById = asyncWrapper(

    async (
      req: Request,
      res: Response
    ) => {


      const id = String(req.params.id);
      const team =
        await this.service.getTeamById(

          req.user!.organizationId,

          id

        );



      res.status(200).json({

        success: true,

        data: team,

      });

    }

  );








  createTeam = asyncWrapper(

    async (
      req: Request,
      res: Response
    ) => {


      const team =
        await this.service.createTeam(

          req.user!.organizationId,

          req.user!.id,

          req.body

        );



      res.status(201).json({

        success: true,

        data: team,

      });

    }

  );








  updateTeam = asyncWrapper(

    async (
      req: Request,
      res: Response
    ) => {


      const id = String(req.params.id);
      const team =
        await this.service.updateTeam(

          req.user!.organizationId,

          id,

          req.body

        );



      res.status(200).json({

        success: true,

        data: team,

      });

    }

  );








  deleteTeam = asyncWrapper(

    async (
      req: Request,
      res: Response
    ) => {


      const id = String(req.params.id);
      await this.service.deleteTeam(

        req.user!.organizationId,

        id

      );



      res.status(200).json({

        success:true,

        message:
          'Team deleted successfully',

      });

    }

  );








  getMembers = asyncWrapper(

    async (
      req: Request,
      res: Response
    ) => {


      const id = String(req.params.id);
      const members =
        await this.service.getMembers(

          req.user!.organizationId,

          id

        );



      res.status(200).json({

        success:true,

        data:members,

      });

    }

  );








  updateMembership = asyncWrapper(

    async (
      req: Request,
      res: Response
    ) => {


      const id = String(req.params.id);
      const userId = String(req.params.userId);
      const membership =
        await this.service.updateMembership(

          req.user!.organizationId,

          id,

          userId,

          req.body.role

        );



      res.status(200).json({

        success:true,

        data:membership,

      });

    }

  );








  removeMember = asyncWrapper(

    async (
      req: Request,
      res: Response
    ) => {


      const id = String(req.params.id);
      const userId = String(req.params.userId);
      await this.service.removeMember(

        req.user!.organizationId,

        id,

        userId

      );



      res.status(200).json({

        success:true,

        message:
          'Member removed successfully',

      });

    }

  );








  getInvitations = asyncWrapper(
    async (
      req: Request,
      res: Response
    ) => {
      const id = String(req.params.id);

      const invitations =
        await this.service.getInvitations(
          req.user!.organizationId,
          id
        );

      res.status(200).json({
        success: true,
        data: invitations,
      });
    }
  );

  inviteMember = asyncWrapper(

    async (
      req: Request,
      res: Response
    ) => {


      const id = String(req.params.id);
      const invitation =
        await this.service.inviteMember(

          req.user!.organizationId,

          id,

          req.user!.id,

          req.body

        );



      res.status(201).json({

        success:true,

        data:invitation,

      });

    }

  );


  /*
   * FEATURE (ledger #1 — invitation accept lifecycle): PUBLIC handlers
   * mounted via team.public.routes.ts (no requireAuth — the HMAC token
   * is the credential). Same response-envelope conventions as the
   * authenticated handlers.
   */
  inspectInvitation = asyncWrapper(
    async (
      req: Request,
      res: Response
    ) => {
      const token = String(req.params.token);

      const details =
        await this.service.inspectInvitation(
          token
        );

      res.status(200).json({
        success: true,
        data: details,
      });
    }
  );

  acceptInvitation = asyncWrapper(
    async (
      req: Request,
      res: Response
    ) => {
      const token = String(req.params.token);

      const result =
        await this.service.acceptInvitation(
          token,
          req.body
        );

      res.status(200).json({
        success: true,
        data: result,
      });
    }
  );
}
