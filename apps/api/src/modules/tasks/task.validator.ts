import { z } from 'zod';
import { TaskStatus, TaskPriority } from '@prisma/client';

const taskIdParamsSchema = z.object({
  id: z.string().uuid('Invalid task ID')
}).strict();

export const taskIdSchema = z.object({
  params: taskIdParamsSchema
});

export const createTaskSchema = z.object({
  body: z.object({
    projectId: z.string().uuid('Invalid project ID'),
    parentTaskId: z.string().uuid().optional().nullable(),
    title: z.string().min(1, 'Title is required').max(255),
    description: z.string().optional().nullable(),
    status: z.nativeEnum(TaskStatus).optional(),
    priority: z.nativeEnum(TaskPriority).optional(),
    assigneeId: z.string().uuid().optional().nullable(),
    dueDate: z.string().datetime().optional().nullable(),
    estimatedHours: z.number().min(0).optional().nullable(),
    position: z.number().optional()
  }).strict()
});

export const updateTaskSchema = z.object({
  params: taskIdParamsSchema,
  body: z.object({
    title: z.string().min(1).max(255).optional(),
    description: z.string().optional().nullable(),
    status: z.nativeEnum(TaskStatus).optional(),
    priority: z.nativeEnum(TaskPriority).optional(),
    assigneeId: z.string().uuid().optional().nullable(),
    dueDate: z.string().datetime().optional().nullable(),
    estimatedHours: z.number().min(0).optional().nullable(),
  }).strict().refine(
    (data) => Object.values(data).some(
      (value) => value !== undefined
    ),
    'At least one task field is required'
  )
});

export const moveTaskSchema = z.object({
  params: taskIdParamsSchema,
  body: z.object({
    status: z.nativeEnum(TaskStatus),
    position: z.number()
  }).strict()
});

export const assignTaskSchema = z.object({
  params: taskIdParamsSchema,
  body: z.object({
    assigneeId: z.string().uuid().nullable()
  }).strict()
});

/*
 * FEATURE (ledger #6, 2026-08-05 — aggregate exception list @500 + the
 * missing door): GET /tasks was the ONLY list route in the codebase with
 * no validateRequest at all — the controller coerced raw `req.query`
 * (`Number(req.query.limit) || 50`, unbounded), so `?limit=10000000` was a
 * valid unbounded read, an invalid enum value 500'd inside Prisma, and
 * `sortBy` reached orderBy unchecked. The schema mirrors what the
 * controller legitimately accepts, with the ledger-#6 aggregate cap: the
 * web fetches this list at limit=100 for dashboard/board aggregations, so
 * it joins the 500 exception class; browse-only lists keep 100.
 * `isArchived` stays the controller's 'true'/'false' string contract;
 * sortBy is whitelisted to the exact set TaskQueryDto declares.
 */
const listTasksQueryObjectSchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(500).default(50),
    search: z.string().trim().min(1).max(255).optional(),
    projectId: z.string().uuid('Invalid project ID').optional(),
    assigneeId: z.string().uuid('Invalid assignee ID').optional(),
    status: z.nativeEnum(TaskStatus).optional(),
    priority: z.nativeEnum(TaskPriority).optional(),
    isArchived: z.enum(['true', 'false']).optional(),
    sortBy: z
      .enum([
        'createdAt',
        'updatedAt',
        'dueDate',
        'priority',
        'position',
      ])
      .optional(),
    sortOrder: z.enum(['asc', 'desc']).optional(),
  })
  .strict();

export const listTasksQuerySchema = z
  .object({
    body: z.object({}).strict().optional(),
    query: listTasksQueryObjectSchema,
    params: z.object({}).strict().optional(),
  })
  .strict();

export type ListTasksQueryRequest = z.infer<
  typeof listTasksQuerySchema
>;
