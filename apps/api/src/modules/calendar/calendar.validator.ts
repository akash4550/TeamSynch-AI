import { z } from 'zod';

const emptyObjectSchema = z.object({}).strict();

export const getCalendarFeedSchema = z.object({
  body: emptyObjectSchema.optional(),
  params: emptyObjectSchema.optional(),
  query: emptyObjectSchema.optional(),
});

export const createCalendarEventSchema = z.object({
  body: emptyObjectSchema.optional(),
  params: emptyObjectSchema.optional(),
  query: emptyObjectSchema.optional(),
});
