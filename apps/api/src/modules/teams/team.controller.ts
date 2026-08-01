import { Request, Response } from 'express';

import { TeamService } from './team.service';

import { asyncWrapper } from '../../core/utils/asyncWrapper';



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



      const teams =
        await this.service.getTeams(

          organizationId,

          req.query

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

}