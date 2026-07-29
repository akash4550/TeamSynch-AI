import { ActivityLog, ActivityType, EntityType, Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { BaseTenantRepository } from '../../core/database/BaseTenantRepository';
import { executeCursorQuery, CursorPaginatedResult } from '../../core/database/cursorPagination';

export interface AuditQueryOptions {
  cursor?: string;
  limit?: number;
  userId?: string;
  type?: ActivityType;
  entityType?: EntityType;
  startDate?: string;
  endDate?: string;
}

export class AuditRepository extends BaseTenantRepository<ActivityLog> {
  /**
   * Safe cursor-paginated audit trail lookup over compound indexes
   */
  async findAuditLogsWithCursor(
    organizationId: string,
    options: AuditQueryOptions
  ): Promise<CursorPaginatedResult<ActivityLog>> {
    const where: Prisma.ActivityLogWhereInput = {
      organizationId,
    };

    if (options.userId) where.userId = options.userId;
    if (options.type) where.type = options.type;
    if (options.entityType) where.entityType = options.entityType;

    if (options.startDate || options.endDate) {
      where.createdAt = {
        ...(options.startDate ? { gte: new Date(options.startDate) } : {}),
        ...(options.endDate ? { lte: new Date(options.endDate) } : {}),
      };
    }

    return executeCursorQuery(
      prisma.activityLog,
      {
        where,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: { id: true, firstName: true, lastName: true, email: true, avatar: true },
          },
        },
      },
      {
        cursor: options.cursor,
        limit: options.limit,
      }
    );
  }

  /**
   * Records an immutable audit log entry in the database
   */
  async recordAuditEntry(data: {
    organizationId: string;
    userId?: string;
    type: ActivityType;
    entityType: EntityType;
    entityId: string;
    metadata?: Prisma.InputJsonValue;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<ActivityLog> {
    return prisma.activityLog.create({
      data: {
        organizationId: data.organizationId,
        userId: data.userId,
        type: data.type,
        entityType: data.entityType,
        entityId: data.entityId,
        metadata: data.metadata,
        ipAddress: data.ipAddress,
        userAgent: data.userAgent,
      },
    });
  }

  async findAllForExport(organizationId: string, options: AuditQueryOptions): Promise<ActivityLog[]> {
    const where: Prisma.ActivityLogWhereInput = {
      organizationId,
    };

    if (options.userId) where.userId = options.userId;
    if (options.type) where.type = options.type;
    if (options.entityType) where.entityType = options.entityType;

    if (options.startDate || options.endDate) {
      where.createdAt = {
        ...(options.startDate ? { gte: new Date(options.startDate) } : {}),
        ...(options.endDate ? { lte: new Date(options.endDate) } : {}),
      };
    }

    return prisma.activityLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 5000, // Export cap for memory safety
      include: {
        user: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });
  }
}
