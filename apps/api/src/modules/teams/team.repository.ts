import { Prisma, TeamRole, InvitationStatus } from '@prisma/client';

import { prisma } from '../../config/prisma';

import {
  CreateTeamDto,
  UpdateTeamDto,
  TeamQueryDto,
} from './team.dto';



export class TeamRepository {



  async findById(
    organizationId: string,
    id: string
  ) {


    return prisma.team.findFirst({

      where: {

        id,

        organizationId,

        deletedAt: null,

      },


      include: {

        owner: {

          select: {

            id: true,

            firstName: true,

            lastName: true,

            email: true,

            avatar: true,

          },

        },


        _count: {

          select: {

            memberships: true,

          },

        },

      },

    });

  }






  async findMany(
    organizationId: string,
    query: TeamQueryDto
  ) {


    const {

      page = 1,

      limit = 20,

      search,

      ownerId,

      sortBy = 'createdAt',

      sortOrder = 'desc',

    } = query;



    const skip =
      (page - 1) * limit;




    const where: Prisma.TeamWhereInput = {

      organizationId,

      deletedAt: null,


      ...(ownerId && {

        ownerId,

      }),


      ...(search && {

        name: {

          contains: search,

          mode: 'insensitive',

        },

      }),

    };



    const orderBy: Prisma.TeamOrderByWithRelationInput = {

      [sortBy]: sortOrder,

    };



    const [teams, total] =
      await prisma.$transaction([


        prisma.team.findMany({

          where,

          skip,

          take: limit,

          orderBy,


          include: {

            owner: {

              select: {

                id: true,

                firstName: true,

                lastName: true,

                avatar: true,

              },

            },


            _count: {

              select: {

                memberships: true,

              },

            },

          },

        }),



        prisma.team.count({

          where,

        }),


      ]);



    return {

      teams,

      total,

    };

  }







  async getUserTeams(
    organizationId: string,
    userId: string
  ) {


    return prisma.teamMembership.findMany({

      where: {

        userId,

        team: {

          organizationId,

          deletedAt: null,

        },

      },


      include: {

        team: true,

      },

    });

  }







  async create(
    organizationId: string,
    ownerId: string,
    data: CreateTeamDto
  ) {


    return prisma.$transaction(async(tx)=>{


      const team =
        await tx.team.create({

          data: {

            organizationId,

            ownerId,

            name: data.name,

            description: data.description,

            color: data.color,

            icon: data.icon,

          },

        });



      await tx.teamMembership.create({

        data: {

          teamId: team.id,

          userId: ownerId,

          role: TeamRole.OWNER,

        },

      });



      return team;


    });

  }







  async update(
    organizationId: string,
    id: string,
    data: UpdateTeamDto
  ) {


    const team =
      await this.findById(

        organizationId,

        id

      );


    if (!team) return null;



    return prisma.team.update({

      where: {

        id,

      },


      data,

    });

  }







  async softDelete(
    organizationId: string,
    id: string
  ) {


    const team =
      await this.findById(

        organizationId,

        id

      );


    if (!team) return null;



    return prisma.team.update({

      where: {

        id,

      },


      data: {

        deletedAt: new Date(),

      },

    });

  }







  async getMembers(
    organizationId: string,
    teamId: string
  ) {


    return prisma.teamMembership.findMany({

      where: {

        teamId,

        team: {

          organizationId,

          deletedAt: null,

        },

      },


      include: {

        user: {

          select: {

            id:true,

            firstName:true,

            lastName:true,

            email:true,

            avatar:true,

          },

        },

      },

    });

  }



  async getMembership(
    teamId: string,
    userId: string
  ) {
    return prisma.teamMembership.findUnique({
      where: {
        teamId_userId: {
          teamId,
          userId,
        },
      },
    });
  }







  async addMember(
    teamId:string,
    userId:string,
    role:TeamRole
  ){

    return prisma.teamMembership.create({

      data:{

        teamId,

        userId,

        role,

      },

    });

  }







  async updateMembership(
    teamId:string,
    userId:string,
    role:TeamRole
  ){

    return prisma.teamMembership.update({

      where:{

        teamId_userId:{

          teamId,

          userId,

        },

      },


      data:{
        role,
      },

    });

  }







  async removeMember(
    teamId:string,
    userId:string
  ){

    return prisma.teamMembership.delete({

      where:{

        teamId_userId:{

          teamId,

          userId,

        },

      },

    });

  }







  async getInvitations(
    organizationId: string,
    teamId: string
  ) {
    return prisma.teamInvitation.findMany({
      where: {
        organizationId,
        teamId,
      },
      include: {
        invitedBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            avatar: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }
  async createInvitation(
    organizationId:string,
    teamId:string,
    email:string,
    invitedById:string
  ){


    const expiresAt=new Date();

    expiresAt.setDate(
      expiresAt.getDate()+7
    );



    return prisma.teamInvitation.create({

      data:{

        organizationId,

        teamId,

        email,

        invitedById,

        expiresAt,

        status:InvitationStatus.PENDING,

      },

    });

  }

}