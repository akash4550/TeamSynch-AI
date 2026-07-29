import { z } from 'zod';
import { ActivityType, EntityType } from '@prisma/client';

const emptyObjectSchema = z.object({}).strict();

export const getAuditLogsSchema = z.object({
  body: emptyObjectSchema.optional(),
  params: emptyObjectSchema.optional(),
  query: z.object({
    cursor: z.string().optional(),
    limit: z.coerce.number().int().positive().max(100).default(20),
    userId: z.string().uuid().optional(),
    type: z.nativeEnum(ActivityType).optional(),
    entityType: z.nativeEnum(EntityType).optional(),
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
  }),
});

export const exportAuditLogsSchema = z.object({
  body: z.object({
    format: z.enum(['CSV', 'JSON']).default('CSV'),
    userId: z.string().uuid().optional(),
    type: z.nativeEnum(ActivityType).optional(),
    entityType: z.nativeEnum(EntityType).optional(),
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
  }),
});

export type GetAuditLogsQuery = z.infer<typeof getAuditLogsSchema>['query'];
export type ExportAuditLogsBody = z.infer<typeof exportAuditLogsSchema>['body'];
