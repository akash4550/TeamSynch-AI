import { z } from 'zod';

const contactIdParamsSchema = z
  .object({
    id: z.string().uuid('Contact ID must be a valid UUID'),
  })
  .strict();

const emptyObjectSchema = z.object({}).strict();

const createContactBodySchema = z
  .object({
    clientId: z.string().uuid('Client ID must be a valid UUID'),
    firstName: z.string().trim().min(1).max(100),
    lastName: z.string().trim().min(1).max(100),
    email: z.string().trim().email().optional().or(z.literal('')),
    phone: z.string().trim().max(50).optional(),
    designation: z.string().trim().max(100).optional(),
  })
  .strict();

const updateContactBodySchema = createContactBodySchema
  .omit({ clientId: true })
  .partial()
  .strict()
  .refine(
    (body) => Object.keys(body).length > 0,
    'At least one contact field is required',
  );

const contactQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    // FEATURE (ledger #6, 2026-08-05 — aggregate exception list @500):
    // aggregate/dropdown-consumed list raised from 100 (browse lists keep
    // 100); the UI declares truncation when total exceeds the fetched set.
    limit: z.coerce.number().int().min(1).max(500).default(10),
    clientId: z.string().uuid('Client ID must be a valid UUID').optional(),
    search: z.string().trim().min(1).max(255).optional(),
    sortBy: z.enum(['firstName', 'createdAt']).default('createdAt'),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
  })
  .strict();

export const createContactSchema = z
  .object({
    body: createContactBodySchema,
    params: emptyObjectSchema.optional(),
    query: emptyObjectSchema.optional(),
  })
  .strict();

export const listContactsSchema = z
  .object({
    body: emptyObjectSchema.optional(),
    params: emptyObjectSchema.optional(),
    query: contactQuerySchema,
  })
  .strict();

export const getContactSchema = z
  .object({
    body: emptyObjectSchema.optional(),
    params: contactIdParamsSchema,
    query: emptyObjectSchema.optional(),
  })
  .strict();

export const updateContactSchema = z
  .object({
    body: updateContactBodySchema,
    params: contactIdParamsSchema,
    query: emptyObjectSchema.optional(),
  })
  .strict();

export const deleteContactSchema = z
  .object({
    body: emptyObjectSchema.optional(),
    params: contactIdParamsSchema,
    query: emptyObjectSchema.optional(),
  })
  .strict();

export type CreateContactRequest = z.infer<typeof createContactSchema>;
export type ListContactsRequest = z.infer<typeof listContactsSchema>;
export type GetContactRequest = z.infer<typeof getContactSchema>;
export type UpdateContactRequest = z.infer<typeof updateContactSchema>;
export type DeleteContactRequest = z.infer<typeof deleteContactSchema>;