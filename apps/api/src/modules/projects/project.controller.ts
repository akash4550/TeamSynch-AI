import { Request, Response } from 'express';

import { ProjectService } from './project.service';
import { getValidatedRequest } from '../../core/middlewares/validateRequest';
import type { ProjectListRequest } from './project.validator';

import { asyncWrapper } from '../../core/utils/asyncWrapper';



export class ProjectController {


  private service: ProjectService;



  constructor(){

    this.service =
      new ProjectService();

  }







  getProjects = asyncWrapper(

    async(
      req:Request,
      res:Response
    )=>{


      /*
       * BUG FIX (#113, 2026-08-06): read the VALIDATED, coerced query —
       * never raw req.query again (the route now runs
       * validateRequest(projectListSchema); getValidatedRequest answers
       * 500-by-design if that wiring is ever removed, so the bypass
       * cannot silently return). The `{ success, data }` response
       * contract is unchanged.
       */
      const { query } =
        getValidatedRequest<ProjectListRequest>(req);

      const projects =
        await this.service.getProjects(

          req.user!.organizationId,

          query

        );



      res.status(200).json({

        success:true,

        data:projects,

      });

    }

  );








  getProjectById = asyncWrapper(

    async(
      req:Request,
      res:Response
    )=>{


      const id = String(req.params.id);
      const project =
        await this.service.getProjectById(

          req.user!.organizationId,

          id

        );



      res.status(200).json({

        success:true,

        data:project,

      });

    }

  );








  createProject = asyncWrapper(

    async(
      req:Request,
      res:Response
    )=>{


      const project =
        await this.service.createProject(

          req.user!.organizationId,

          req.user!.id,

          req.body

        );



      res.status(201).json({

        success:true,

        data:project,

      });

    }

  );








  updateProject = asyncWrapper(

    async(
      req:Request,
      res:Response
    )=>{


      const id = String(req.params.id);
      const project =
        await this.service.updateProject(

          req.user!.organizationId,

          id,

          req.body,

          /* Bug #84: actor for the audit-trail ProjectUpdated event */
          req.user!.id

        );



      res.status(200).json({

        success:true,

        data:project,

      });

    }

  );








  archiveProject = asyncWrapper(

    async(
      req:Request,
      res:Response
    )=>{


      const id = String(req.params.id);
      const project =
        await this.service.archiveProject(

          req.user!.organizationId,

          id,

          /* Bug #84: actor for the audit-trail ProjectUpdated event */
          req.user!.id

        );



      res.status(200).json({

        success:true,

        data:project,

      });

    }

  );








  restoreProject = asyncWrapper(

    async(
      req:Request,
      res:Response
    )=>{


      const id = String(req.params.id);
      const project =
        await this.service.restoreProject(

          req.user!.organizationId,

          id,

          /* Bug #84: actor for the audit-trail ProjectUpdated event */
          req.user!.id

        );



      res.status(200).json({

        success:true,

        data:project,

      });

    }

  );








  deleteProject = asyncWrapper(

    async(
      req:Request,
      res:Response
    )=>{


      const id = String(req.params.id);
      await this.service.deleteProject(

        req.user!.organizationId,

        id,

        /* Bug #84: actor for the audit-trail ProjectDeleted event */
        req.user!.id

      );



      res.status(200).json({

        success:true,

        message:
          'Project deleted successfully',

      });

    }

  );

}