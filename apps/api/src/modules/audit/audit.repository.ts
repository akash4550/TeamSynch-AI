import { ActivityLog, ActivityType, EntityType, Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { BaseTenantRepository } from '../../core/database/BaseTenantRepository';
import { executeCursorQuery, CursorPaginatedResult } from '../../core/database/cursorPagination';

/**
 * Memory-safety cap for compliance exports (BUG FIX #71): exports never
 * materialize more than this many rows; callers receive an explicit
 * `truncated` flag when the cap cut rows off.
 */
export const AUDIT_EXPORT_ROW_CAP = 5000;

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

  /*
   * BUG FIX (#71 — silent export truncation): the export was capped at 5000
   * rows with NO truncation signal anywhere downstream: the processor
   * reported `totalRecords: 5000` and the UI announced "Export complete",
   * so an admin archiving a compliance trail could not know rows were
   * dropped. The query now over-fetches by one row as a truncation probe
   * (cap+1; a single extra row is negligible against the memory-safety
   * intent of the cap) and returns an explicit `truncated` flag that the
   * worker surfaces in the completion payload.
   */
  async findAllForExport(
    organizationId: string,
    options: AuditQueryOptions
  ): Promise<{ logs: ActivityLog[]; truncated: boolean }> {
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

    const rows = await prisma.activityLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: AUDIT_EXPORT_ROW_CAP + 1, // +1 row = truncation probe (BUG FIX #71)
      include: {
        user: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });

    const truncated = rows.length > AUDIT_EXPORT_ROW_CAP;
    return {
      logs: truncated ? rows.slice(0, AUDIT_EXPORT_ROW_CAP) : rows,
      truncated,
    };
  }
}
