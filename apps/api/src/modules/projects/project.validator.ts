import { ProjectStatus } from '@prisma/client';
import { z } from 'zod';

const emptyObjectSchema = z.object({}).strict();
const uuidSchema = z.string().uuid('Invalid id');
const projectIdParamsSchema = z.object({
  id: uuidSchema,
}).strict();
const optionalNullableDateSchema = z
  .string()
  .datetime()
  .transform((value) => new Date(value))
  .nullable()
  .optional();

const createProjectBodySchema = z.object({
  name: z
    .string()
    .min(2, 'Name must be at least 2 characters')
    .max(100),
  key: z
    .string()
    .min(2)
    .max(10)
    .regex(
      /^[A-Z0-9]+$/,
      'Key can only contain uppercase letters and numbers',
    ),
  description: z.string().max(1000).nullable().optional(),
  status: z.nativeEnum(ProjectStatus).optional(),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, 'Invalid hex color')
    .nullable()
    .optional(),
  icon: z.string().nullable().optional(),
  startDate: optionalNullableDateSchema,
  endDate: optionalNullableDateSchema,
}).strict();

const updateProjectBodySchema = z.object({
  name: z.string().min(2).max(100).optional(),
  description: z.string().max(1000).nullable().optional(),
  status: z.nativeEnum(ProjectStatus).optional(),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .nullable()
    .optional(),
  icon: z.string().nullable().optional(),
  startDate: optionalNullableDateSchema,
  endDate: optionalNullableDateSchema,
}).strict().refine(
  (data) => Object.values(data).some((value) => value !== undefined),
  'At least one project field is required',
);

const archivedQuerySchema = z
  .enum(['true', 'false'])
  .transform((value) => value === 'true')
  .optional();

export const createProjectSchema = z.object({
  body: createProjectBodySchema,
  params: emptyObjectSchema,
  query: emptyObjectSchema,
}).strict();

export const updateProjectSchema = z.object({
  body: updateProjectBodySchema,
  params: projectIdParamsSchema,
  query: emptyObjectSchema,
}).strict();

export const getProjectSchema = z.object({
  body: z.undefined().optional(),
  params: projectIdParamsSchema,
  query: emptyObjectSchema,
}).strict();

export const deleteProjectSchema = z.object({
  body: z.undefined().optional(),
  params: projectIdParamsSchema,
  query: emptyObjectSchema,
}).strict();

export const projectListSchema = z.object({
  body: z.undefined().optional(),
  params: emptyObjectSchema,
  query: z.object({
    page: z.coerce.number().int().positive().default(1),
    // FEATURE (ledger #6, 2026-08-05 — aggregate exception list @500):
    // aggregate/dropdown-consumed list raised from 100 (browse lists keep
    // 100); the UI declares truncation when total exceeds the fetched set.
    limit: z.coerce.number().int().positive().max(500).default(20),
    search: z.string().optional(),
    status: z.nativeEnum(ProjectStatus).optional(),
    ownerId: uuidSchema.optional(),
    isArchived: archivedQuerySchema,
    sortBy: z.enum([
      'name',
      'createdAt',
      'updatedAt',
      'endDate',
    ]).optional(),
    sortOrder: z.enum(['asc', 'desc']).optional(),
  }).strict(),
}).strict();

export type CreateProjectRequest = z.infer<typeof createProjectSchema>;
export type UpdateProjectRequest = z.infer<typeof updateProjectSchema>;
export type GetProjectRequest = z.infer<typeof getProjectSchema>;
export type DeleteProjectRequest = z.infer<typeof deleteProjectSchema>;
export type ProjectListRequest = z.infer<typeof projectListSchema>;
