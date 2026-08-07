import { z } from 'zod';

const opportunityIdParamsSchema = z
  .object({
    id: z.string().uuid('Opportunity ID must be a valid UUID'),
  })
  .strict();

const emptyObjectSchema = z.object({}).strict();

const closeDateSchema = z.union([
  z.string().datetime('Close date must be a valid ISO datetime'),
  z.date(),
]);

const createOpportunityBodySchema = z
  .object({
    leadId: z.string().uuid('Lead ID must be a valid UUID'),
    stageId: z.string().uuid('Stage ID must be a valid UUID'),
    expectedRevenue: z.number().min(0).optional(),
    closeDate: closeDateSchema.optional(),
    probability: z.number().min(0).max(100).optional(),
  })
  .strict();

const updateOpportunityBodySchema = createOpportunityBodySchema
  .partial()
  .strict()
  .refine(
    (body) => Object.keys(body).length > 0,
    'At least one opportunity field is required',
  );

const opportunityQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    // FEATURE (ledger #6, 2026-08-05 — aggregate exception list @500):
    // the web aggregates over this list (CRM dashboard pipeline value /
    // avg probability, Pipeline Board) — 100 silently truncated the 101st+
    // deal out of every number. Browse lists keep 100; this aggregate-
    // consumed list allows 500, and the UI declares truncation beyond it.
    limit: z.coerce.number().int().min(1).max(500).default(10),
    search: z.string().trim().min(1).max(255).optional(),
    stageId: z.string().uuid('Stage ID must be a valid UUID').optional(),
    sortBy: z
      .enum([
        'expectedRevenue',
        'createdAt',
        'closeDate',
      ])
      .default('createdAt'),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
  })
  .strict();

export const createOpportunitySchema = z
  .object({
    body: createOpportunityBodySchema,
    params: emptyObjectSchema.optional(),
    query: emptyObjectSchema.optional(),
  })
  .strict();

export const listOpportunitiesSchema = z
  .object({
    body: emptyObjectSchema.optional(),
    params: emptyObjectSchema.optional(),
    query: opportunityQuerySchema,
  })
  .strict();

export const getOpportunitySchema = z
  .object({
    body: emptyObjectSchema.optional(),
    params: opportunityIdParamsSchema,
    query: emptyObjectSchema.optional(),
  })
  .strict();

export const updateOpportunitySchema = z
  .object({
    body: updateOpportunityBodySchema,
    params: opportunityIdParamsSchema,
    query: emptyObjectSchema.optional(),
  })
  .strict();

export const deleteOpportunitySchema = z
  .object({
    body: emptyObjectSchema.optional(),
    params: opportunityIdParamsSchema,
    query: emptyObjectSchema.optional(),
  })
  .strict();

export type CreateOpportunityRequest = z.infer<
  typeof createOpportunitySchema
>;

export type ListOpportunitiesRequest = z.infer<
  typeof listOpportunitiesSchema
>;

export type GetOpportunityRequest = z.infer<
  typeof getOpportunitySchema
>;

export type UpdateOpportunityRequest = z.infer<
  typeof updateOpportunitySchema
>;

export type DeleteOpportunityRequest = z.infer<
  typeof deleteOpportunitySchema
>;