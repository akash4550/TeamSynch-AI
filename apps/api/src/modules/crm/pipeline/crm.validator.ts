import { z } from 'zod';

const emptyObjectSchema = z.object({}).strict();

const uuidSchema = z.string().uuid('Invalid UUID format');

export const createPipelineStageSchema = z.object({
  body: z.object({
    name: z.string().trim().min(1, 'Stage name is required').max(100),
    probability: z.number().int().min(0).max(100).default(50),
    position: z.number().finite().min(0),
  }).strict(),
});

export const createOpportunitySchema = z.object({
  body: z.object({
    leadId: uuidSchema,
    stageId: uuidSchema,
    expectedRevenue: z.number().min(0).optional(),
    closeDate: z.string().datetime().optional(),
    probability: z.number().min(0).max(100).optional(),
  }).strict(),
});

export const moveOpportunitySchema = z.object({
  params: z.object({
    id: uuidSchema,
  }).strict(),
  body: z.object({
    targetStageId: uuidSchema,
    newPosition: z.number().optional(),
  }).strict(),
});

export type CreatePipelineStageDto = z.infer<typeof createPipelineStageSchema>['body'];
export type CreateOpportunityDto = z.infer<typeof createOpportunitySchema>['body'];
export type MoveOpportunityDto = z.infer<typeof moveOpportunitySchema>['body'];
