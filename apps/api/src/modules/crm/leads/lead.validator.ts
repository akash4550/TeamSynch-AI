import { LeadStatus } from '@prisma/client';
import { z } from 'zod';

const leadIdParamsSchema = z
  .object({
    id: z.string().uuid('Lead ID must be a valid UUID'),
  })
  .strict();

const emptyObjectSchema = z.object({}).strict();

const createLeadBodySchema = z
  .object({
    title: z.string().trim().min(1).max(255),
    source: z.string().trim().max(100).optional(),
    score: z.number().min(0).max(100).optional(),
    assignedTo: z.string().uuid().optional(),
    expectedValue: z.number().min(0).optional(),
  })
  .strict();

const updateLeadBodySchema = createLeadBodySchema
  .partial()
  .extend({
    status: z.nativeEnum(LeadStatus).optional(),
  })
  .strict()
  .refine(
    (body) => Object.keys(body).length > 0,
    'At least one lead field is required',
  );

const leadQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    // FEATURE (ledger #6, 2026-08-05 — aggregate exception list @500):
    // aggregate/dropdown-consumed list raised from 100 (browse lists keep
    // 100); the UI declares truncation when total exceeds the fetched set.
    limit: z.coerce.number().int().min(1).max(500).default(10),
    search: z.string().trim().min(1).max(255).optional(),
    status: z.nativeEnum(LeadStatus).optional(),
    sortBy: z.enum(['title', 'createdAt', 'score']).default('createdAt'),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
  })
  .strict();

export const createLeadSchema = z
  .object({
    body: createLeadBodySchema,
    params: emptyObjectSchema.optional(),
    query: emptyObjectSchema.optional(),
  })
  .strict();

export const listLeadsSchema = z
  .object({
    body: emptyObjectSchema.optional(),
    params: emptyObjectSchema.optional(),
    query: leadQuerySchema,
  })
  .strict();

export const getLeadSchema = z
  .object({
    body: emptyObjectSchema.optional(),
    params: leadIdParamsSchema,
    query: emptyObjectSchema.optional(),
  })
  .strict();

export const updateLeadSchema = z
  .object({
    body: updateLeadBodySchema,
    params: leadIdParamsSchema,
    query: emptyObjectSchema.optional(),
  })
  .strict();

export const deleteLeadSchema = z
  .object({
    body: emptyObjectSchema.optional(),
    params: leadIdParamsSchema,
    query: emptyObjectSchema.optional(),
  })
  .strict();

export type CreateLeadRequest = z.infer<typeof createLeadSchema>;
export type ListLeadsRequest = z.infer<typeof listLeadsSchema>;
export type GetLeadRequest = z.infer<typeof getLeadSchema>;
export type UpdateLeadRequest = z.infer<typeof updateLeadSchema>;
export type DeleteLeadRequest = z.infer<typeof deleteLeadSchema>;