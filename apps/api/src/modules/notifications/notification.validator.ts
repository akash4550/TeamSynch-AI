import { z } from 'zod';

const emptyObjectSchema = z.object({}).strict();
const uuidParamsSchema = z.object({
  id: z.string().uuid('Invalid notification ID'),
}).strict();

export const getNotificationsSchema = z.object({
  body: emptyObjectSchema.optional(),
  params: emptyObjectSchema.optional(),
  query: z.object({
    limit: z.coerce.number().int().positive().max(100).default(20),
  }).optional(),
});

export const markReadSchema = z.object({
  body: emptyObjectSchema.optional(),
  params: uuidParamsSchema,
  query: emptyObjectSchema.optional(),
});

export const markAllReadSchema = z.object({
  body: emptyObjectSchema.optional(),
  params: emptyObjectSchema.optional(),
  query: emptyObjectSchema.optional(),
});
