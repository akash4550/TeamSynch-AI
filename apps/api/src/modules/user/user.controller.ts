import { Request, Response } from 'express';

import { UserService } from './user.service';

import { asyncWrapper } from '../../core/utils/asyncWrapper';
import { getValidatedRequest } from '../../core/middlewares/validateRequest';
import {
  DeleteUserRequest,
  ListUsersRequest,
  UpdateOwnProfileRequest,
  UpdateUserRequest,
  UpdateUserRoleRequest,
  UpdateUserStatusRequest,
} from './user.validator';



export class UserController {


  private service: UserService;


  constructor() {

    this.service = new UserService();

  }




  getUsers = asyncWrapper(

    async (
      req: Request,
      res: Response
    ) => {


      const organizationId =
        req.user!.organizationId;

      /*
       * BUG FIX (#114, 2026-08-06): read the VALIDATED, coerced query —
       * never raw req.query again. This route mounts
       * validateRequest(listUsersSchema), but its output was being
       * discarded while raw string values flowed downstream:
       * `?page=1&limit=10` (which the live UserManagement page sends on
       * every render) reached Prisma as the STRINGS "1"/"10", hitting
       * Int-typed `take` (client-side argument validation error → 500)
       * and echoing `"1"` into `pagination.page` where the contract
       * promises a number. getValidatedRequest answers 500-by-design if
       * the schema wiring is ever removed, so the bypass cannot silently
       * return. The `{ success, data }` response contract is unchanged.
       */
      const { query } =
        getValidatedRequest<ListUsersRequest>(req);



      const result =
        await this.service.getUsers(

          organizationId,

          query

        );



      res.status(200).json({

        success: true,

        data: result,

      });

    }

  );







  getUserById = asyncWrapper(

    async (
      req: Request,
      res: Response
    ) => {


      const organizationId =
        req.user!.organizationId;


      const userId =
        String(req.params.id);



      const user =
        await this.service.getUserById(

          organizationId,

          userId

        );



      res.status(200).json({

        success: true,

        data: user,

      });

    }

  );







  createUser = asyncWrapper(

    async (
      req: Request,
      res: Response
    ) => {


      const organizationId =
        req.user!.organizationId;



      const user =
        await this.service.createUser(

          organizationId,

          req.body

        );



      res.status(201).json({

        success: true,

        data: user,

      });

    }

  );







  updateOwnProfile = asyncWrapper(

    async (
      req: Request,
      res: Response
    ) => {


      const { body } =
        getValidatedRequest<UpdateOwnProfileRequest>(req);



      const user =
        await this.service.updateOwnProfile(

          req.user!,

          body

        );



      res.status(200).json({

        success: true,

        data: user,

      });

    }

  );







  updateUser = asyncWrapper(

    async (
      req: Request,
      res: Response
    ) => {


      const { params, body } =
        getValidatedRequest<UpdateUserRequest>(req);



      const user =
        await this.service.updateUserProfile(

          req.user!,

          params.id,

          body

        );



      res.status(200).json({

        success: true,

        data: user,

      });

    }

  );







  updateUserRole = asyncWrapper(

    async (
      req: Request,
      res: Response
    ) => {


      const { params, body } =
        getValidatedRequest<UpdateUserRoleRequest>(req);



      const user =
        await this.service.updateUserRole(

          req.user!,

          params.id,

          body

        );



      res.status(200).json({

        success: true,

        data: user,

      });

    }

  );







  updateUserStatus = asyncWrapper(

    async (
      req: Request,
      res: Response
    ) => {


      const { params, body } =
        getValidatedRequest<UpdateUserStatusRequest>(req);



      const user =
        await this.service.updateUserStatus(

          req.user!,

          params.id,

          body

        );



      res.status(200).json({

        success: true,

        data: user,

      });

    }

  );







  deleteUser = asyncWrapper(

    async (
      req: Request,
      res: Response
    ) => {


      const { params } =
        getValidatedRequest<DeleteUserRequest>(req);



      await this.service.deleteUser(

        req.user!,

        params.id

      );



      res.status(200).json({

        success: true,

        message:
          'User deleted successfully',

      });

    }

  );

}
