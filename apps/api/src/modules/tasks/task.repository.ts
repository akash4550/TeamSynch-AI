import { Prisma, TaskStatus } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { AppError } from '../../core/errors/AppError';
import { executeCursorQuery, CursorPaginatedResult } from '../../core/database/cursorPagination';
import {
  CreateTaskDto,
  UpdateTaskDto,
  TaskQueryDto,
} from './task.dto';

const taskReferenceNotFound = () =>
  new AppError(
    'One or more task references were not found',
    404,
  );

export class TaskRepository {
  private async assertTaskReferences(
    transaction: Prisma.TransactionClient,
    organizationId: string,
    references: {
      projectId: string;
      parentTaskId?: string | null;
      assigneeId?: string | null;
    },
  ): Promise<void> {
    const [project, parentTask, assignee] =
      await Promise.all([
        transaction.project.findFirst({
          where: {
            id: references.projectId,
            organizationId,
            deletedAt: null,
          },
          select: {
            id: true,
          },
        }),

        references.parentTaskId
          ? transaction.task.findFirst({
              where: {
                id: references.parentTaskId,
                organizationId,
                projectId: references.projectId,
                deletedAt: null,
              },
              select: {
                id: true,
              },
            })
          : Promise.resolve(null),

        references.assigneeId
          ? transaction.user.findFirst({
              where: {
                id: references.assigneeId,
                organizationId,
                isActive: true,
                deletedAt: null,
              },
              select: {
                id: true,
              },
            })
          : Promise.resolve(null),
      ]);

    const invalidParentTask =
      references.parentTaskId != null &&
      parentTask === null;

    const invalidAssignee =
      references.assigneeId != null &&
      assignee === null;

    if (
      project === null ||
      invalidParentTask ||
      invalidAssignee
    ) {
      throw taskReferenceNotFound();
    }
  }

  async findById(organizationId: string, id: string) {
    return prisma.task.findFirst({
      where: {
        id,
        organizationId,
        deletedAt: null,
      },
      include: {
        assignee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatar: true,
          },
        },
        reporter: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatar: true,
          },
        },
        project: {
          select: {
            id: true,
            name: true,
            key: true,
          },
        },
        subtasks: {
          where: {
            deletedAt: null,
          },
        },
      },
    });
  }

  /**
   * Scalable Cursor-Based Pagination for multi-tenant tasks using compound index [organizationId, createdAt(desc), deletedAt]
   */
  async findManyWithCursor(
    organizationId: string,
    options: {
      cursor?: string;
      limit?: number;
      projectId?: string;
      status?: TaskStatus;
      assigneeId?: string;
    }
  ): Promise<CursorPaginatedResult<any>> {
    const where: Prisma.TaskWhereInput = {
      organizationId,
      deletedAt: null,
      archived: false,
    };

    if (options.projectId) where.projectId = options.projectId;
    if (options.status) where.status = options.status;
    if (options.assigneeId) where.assigneeId = options.assigneeId;

    return executeCursorQuery(
      prisma.task,
      {
        where,
        orderBy: { createdAt: 'desc' },
        include: {
          assignee: {
            select: { id: true, firstName: true, lastName: true, avatar: true },
          },
          project: {
            select: { id: true, name: true, key: true },
          },
        },
      },
      {
        cursor: options.cursor,
        limit: options.limit,
      }
    );
  }

  async findMany(
    organizationId: string,
    query: TaskQueryDto,
  ) {
    const {
      page = 1,
      limit = 50,
      search,
      projectId,
      assigneeId,
      status,
      priority,
      isArchived,
      sortBy = 'position',
      sortOrder = 'asc',
    } = query;

    const skip = (page - 1) * limit;

    const where: Prisma.TaskWhereInput = {
      organizationId,
      deletedAt: null,
      archived: isArchived ?? false,
      parentTaskId: null,
    };

    if (projectId) where.projectId = projectId;
    if (assigneeId) where.assigneeId = assigneeId;
    if (status) where.status = status;
    if (priority) where.priority = priority;

    if (search) {
      where.OR = [
        {
          title: {
            contains: search,
            mode: 'insensitive',
          },
        },
        {
          description: {
            contains: search,
            mode: 'insensitive',
          },
        },
      ];
    }

    const allowedSortFields: Prisma.TaskScalarFieldEnum[] = [
      'position',
      'createdAt',
      'updatedAt',
      'dueDate',
      'priority',
      'status',
      'title',
    ];

    const orderField = allowedSortFields.includes(
      sortBy as Prisma.TaskScalarFieldEnum,
    )
      ? sortBy
      : 'position';

    const [tasks, total] = await Promise.all([
      prisma.task.findMany({
        where,
        skip,
        take: limit,
        orderBy: {
          [orderField]: sortOrder,
        },
        include: {
          assignee: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              avatar: true,
            },
          },
          project: {
            select: {
              id: true,
              name: true,
              key: true,
            },
          },
          _count: {
            select: {
              subtasks: true,
            },
          },
        },
      }),
      prisma.task.count({ where }),
    ]);

    return {
      data: tasks,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findMaxPosition(
    transaction: Prisma.TransactionClient,
    organizationId: string,
    projectId: string,
    status: TaskStatus,
  ) {
    const task = await transaction.task.findFirst({
      where: {
        organizationId,
        projectId,
        status,
        deletedAt: null,
      },
      orderBy: {
        position: 'desc',
      },
      select: {
        position: true,
      },
    });

    return Number(task?.position ?? 0);
  }

  async create(
    organizationId: string,
    reporterId: string,
    data: CreateTaskDto,
  ) {
    return prisma.$transaction(async (transaction) => {
      await this.assertTaskReferences(
        transaction,
        organizationId,
        {
          projectId: data.projectId,
          parentTaskId: data.parentTaskId,
          assigneeId: data.assigneeId,
        },
      );

      let position = data.position;

      if (position === undefined) {
        const maxPosition = await this.findMaxPosition(
          transaction,
          organizationId,
          data.projectId,
          data.status ?? TaskStatus.TODO,
        );

        position = maxPosition + 65536;
      }

      return transaction.task.create({
        data: {
          organizationId,
          reporterId,
          projectId: data.projectId,
          parentTaskId: data.parentTaskId,
          title: data.title,
          description: data.description,
          status: data.status,
          priority: data.priority,
          assigneeId: data.assigneeId,
          dueDate: data.dueDate,
          estimatedHours: data.estimatedHours,
          position,
        },
      });
    });
  }

  async update(
    organizationId: string,
    id: string,
    data: UpdateTaskDto,
  ) {
    return prisma.$transaction(async (transaction) => {
      const existing = await transaction.task.findFirst({
        where: {
          id,
          organizationId,
          deletedAt: null,
        },
        select: {
          id: true,
          projectId: true,
        },
      });

      if (!existing) {
        return null;
      }

      if (data.assigneeId !== undefined) {
        await this.assertTaskReferences(
          transaction,
          organizationId,
          {
            projectId: existing.projectId,
            assigneeId: data.assigneeId,
          },
        );
      }

      return transaction.task.update({
        where: {
          id,
          organizationId,
          deletedAt: null,
        },
        data,
      });
    });
  }

  async softDelete(
    organizationId: string,
    id: string,
  ) {
    return prisma.task.updateMany({
      where: {
        id,
        organizationId,
        deletedAt: null,
      },
      data: {
        deletedAt: new Date(),
      },
    });
  }
}
