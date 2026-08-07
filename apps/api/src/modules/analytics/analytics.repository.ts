import { prisma } from '../../config/prisma';
import { AppError } from '../../core/errors/AppError';
import { MetricFilterDto } from './analytics.dto';

export class AnalyticsRepository {
  private buildWhereClause(
    organizationId: string,
    filters: MetricFilterDto,
    extraFilters: Record<string, unknown> = {},
    /*
     * FEATURE (ledger #4, 2026-08-05 — metric semantics): the period
     * window used to bind `createdAt` for EVERY metric — including
     * TASKS_COMPLETED, which therefore meant "created in this period and
     * now DONE", silently hiding backlog completions. Callers now name
     * the field the window refers to for their metric ('completedAt' for
     * TASKS_COMPLETED). The default stays 'createdAt', so every untouched
     * metric keeps its cohort semantics byte-identical.
     */
    dateField: 'createdAt' | 'completedAt' = 'createdAt',
  ) {
    const where: any = {
      ...extraFilters,
      organizationId,
    };

    if (filters.startDate || filters.endDate) {
      where[dateField] = {};

      if (filters.startDate) {
        where[dateField].gte = new Date(
          filters.startDate,
        );
      }

      if (filters.endDate) {
        where[dateField].lte = new Date(
          filters.endDate,
        );
      }
    }

    return where;
  }

  async assertFilterScope(
    organizationId: string,
    filters: MetricFilterDto,
  ): Promise<void> {
    const [
      project,
      team,
      user,
    ] = await Promise.all([
      filters.projectId
        ? prisma.project.findFirst({
            where: {
              id: filters.projectId,
              organizationId,
              deletedAt: null,
            },
            select: {
              id: true,
            },
          })
        : Promise.resolve(null),

      filters.teamId
        ? prisma.team.findFirst({
            where: {
              id: filters.teamId,
              organizationId,
              deletedAt: null,
            },
            select: {
              id: true,
            },
          })
        : Promise.resolve(null),

      filters.userId
        ? prisma.user.findFirst({
            where: {
              id: filters.userId,
              organizationId,
              deletedAt: null,
            },
            select: {
              id: true,
            },
          })
        : Promise.resolve(null),
    ]);

    const hasInvalidProject =
      filters.projectId !== undefined &&
      project === null;

    const hasInvalidTeam =
      filters.teamId !== undefined &&
      team === null;

    const hasInvalidUser =
      filters.userId !== undefined &&
      user === null;

    if (
      hasInvalidProject ||
      hasInvalidTeam ||
      hasInvalidUser
    ) {
      throw new AppError(
        'One or more analytics filters were not found',
        404,
      );
    }
  }

  async getActiveUsers(
    organizationId: string,
    filters: MetricFilterDto,
  ): Promise<number> {
    const where = this.buildWhereClause(
      organizationId,
      filters,
      {
        isActive: true,
        deletedAt: null,
      },
    );

    return prisma.user.count({ where });
  }

  async getNewUsers(
    organizationId: string,
    filters: MetricFilterDto,
  ): Promise<number> {
    const where = this.buildWhereClause(
      organizationId,
      filters,
      {
        deletedAt: null,
      },
    );

    return prisma.user.count({ where });
  }

  async getProjectsCreated(
    organizationId: string,
    filters: MetricFilterDto,
  ): Promise<number> {
    const where = this.buildWhereClause(
      organizationId,
      filters,
      {
        deletedAt: null,
      },
    );

    return prisma.project.count({ where });
  }

  async getActiveProjects(
    organizationId: string,
    filters: MetricFilterDto,
  ): Promise<number> {
    const where = this.buildWhereClause(
      organizationId,
      filters,
      {
        status: 'ACTIVE',
        deletedAt: null,
      },
    );

    return prisma.project.count({ where });
  }

  /*
   * BUG FIX (#50 — analytics counted ARCHIVED tasks): every task
   * aggregation below was filtered by organizationId + deletedAt only,
   * while the repository-wide convention is that archived tasks are
   * withdrawn from all live surfaces: task boards list with
   * `archived: false` by default (task.repository) and the calendar feed
   * excludes them explicitly. Analytics was the lone outlier, so
   * dashboards disagreed with the boards they summarize: TASKS_CREATED /
   * TASKS_COMPLETED (and therefore TASK_COMPLETION_RATE), the status
   * distribution chart, and sharpest of all OVERDUE_TASKS included
   * deliberately shelved work — a cancelled-task-with-an-old-dueDate
   * archive inflated the "Overdue" alert metric forever, pointing at
   * work nobody owns. All four task aggregations now pass
   * `archived: false`, keeping the numerator/denominator populations
   * identical and consistent with every other module. (Projects carry no
   * archived flag — verified in schema.)
   */
  async getTasksCreated(
    organizationId: string,
    filters: MetricFilterDto,
  ): Promise<number> {
    const where = this.buildWhereClause(
      organizationId,
      filters,
      {
        deletedAt: null,
        archived: false,
      },
    );

    if (filters.projectId) {
      where.projectId = filters.projectId;
    }

    if (filters.userId) {
      where.assigneeId = filters.userId;
    }

    return prisma.task.count({ where });
  }

  async getTasksCompleted(
    organizationId: string,
    filters: MetricFilterDto,
  ): Promise<number> {
    /*
     * FEATURE (ledger #4, 2026-08-05 — metric semantics, product call:
     * completion-throughput): a date window now matches the task's
     * `completedAt`, so "Tasks Completed (March)" counts everything that
     * got DONE in March — including old backlog work — instead of only
     * March-created tasks that happen to be DONE. Legacy DONE rows with
     * no completedAt stamp are excluded only from WINDOWED queries (by
     * definition they completed outside any sane period); with no window
     * the count is unchanged (all currently-DONE, non-archived, live).
     */
    const where = this.buildWhereClause(
      organizationId,
      filters,
      {
        status: 'DONE',
        deletedAt: null,
        archived: false,
      },
      'completedAt',
    );

    if (filters.projectId) {
      where.projectId = filters.projectId;
    }

    if (filters.userId) {
      where.assigneeId = filters.userId;
    }

    return prisma.task.count({ where });
  }

  async getOverdueTasks(
    organizationId: string,
    filters: MetricFilterDto,
  ): Promise<number> {
    const where = this.buildWhereClause(
      organizationId,
      filters,
      {
        status: {
          not: 'DONE',
        },
        dueDate: {
          lt: new Date(),
        },
        deletedAt: null,
        archived: false,
      },
    );

    if (filters.projectId) {
      where.projectId = filters.projectId;
    }

    if (filters.userId) {
      where.assigneeId = filters.userId;
    }

    return prisma.task.count({ where });
  }

  async getTaskStatusDistribution(
    organizationId: string,
    filters: MetricFilterDto,
  ) {
    const where = this.buildWhereClause(
      organizationId,
      filters,
      {
        deletedAt: null,
        archived: false,
      },
    );

    if (filters.projectId) {
      where.projectId = filters.projectId;
    }

    if (filters.userId) {
      where.assigneeId = filters.userId;
    }

    const distribution = await prisma.task.groupBy({
      by: ['status'],
      where,
      _count: {
        id: true,
      },
    });

    return distribution.map((item) => ({
      category: item.status,
      value: item._count.id,
    }));
  }

  async getLeadsCreated(
    organizationId: string,
    filters: MetricFilterDto,
  ): Promise<number> {
    const where = this.buildWhereClause(
      organizationId,
      filters,
      {
        deletedAt: null,
      },
    );

    return prisma.lead.count({ where });
  }

  async getOpportunities(
    organizationId: string,
    filters: MetricFilterDto,
  ) {
    const where = this.buildWhereClause(
      organizationId,
      filters,
      {
        deletedAt: null,
      },
    );

    where.stage = {
      organizationId,
    };

    return prisma.opportunity.findMany({
      where,
      include: {
        stage: true,
      },
    });
  }

  async getDocumentsUploaded(
    organizationId: string,
    filters: MetricFilterDto,
  ): Promise<number> {
    const where = this.buildWhereClause(
      organizationId,
      filters,
      {
        deletedAt: null,
      },
    );

    if (filters.projectId) {
      where.projectId = filters.projectId;
    }

    return prisma.document.count({ where });
  }

  async getStorageUsage(
    organizationId: string,
    filters: MetricFilterDto,
  ): Promise<number> {
    const where = this.buildWhereClause(
      organizationId,
      filters,
      {
        deletedAt: null,
      },
    );

    if (filters.projectId) {
      where.projectId = filters.projectId;
    }

    const result = await prisma.document.aggregate({
      where,
      _sum: {
        fileSize: true,
      },
    });

    return result._sum.fileSize ?? 0;
  }
}