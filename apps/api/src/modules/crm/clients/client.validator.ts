import { ClientStatus } from '@prisma/client';
import { z } from 'zod';

const clientIdParamsSchema = z.object({
  id: z.string().uuid('Client ID must be a valid UUID'),
}).strict();

const emptyObjectSchema = z.object({}).strict();

const createClientBodySchema = z.object({
  name: z.string().trim().min(1).max(255),
  industry: z.string().trim().max(100).optional(),
  website: z.string().trim().url().max(255).optional().or(z.literal('')),
  phone: z.string().trim().max(50).optional(),
  email: z.string().trim().email().optional().or(z.literal('')),
  address: z.string().trim().max(500).optional(),
  ownerId: z.string().uuid().optional(),
}).strict();

const updateClientBodySchema = createClientBodySchema.partial().extend({
  status: z.nativeEnum(ClientStatus).optional(),
}).strict().refine(
  (body) => Object.keys(body).length > 0,
  'At least one client field is required',
);

const clientQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  // FEATURE (ledger #6, 2026-08-05 — aggregate exception list @500):
  // aggregate/dropdown-consumed list raised from 100 (browse lists keep
  // 100); the UI declares truncation when total exceeds the fetched set.
  limit: z.coerce.number().int().min(1).max(500).default(10),
  search: z.string().trim().min(1).max(255).optional(),
  status: z.nativeEnum(ClientStatus).optional(),
  sortBy: z.enum(['name', 'createdAt', 'updatedAt']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
}).strict();

export const createClientSchema = z.object({
  body: createClientBodySchema,
  params: emptyObjectSchema.optional(),
  query: emptyObjectSchema.optional(),
}).strict();

export const listClientsSchema = z.object({
  body: emptyObjectSchema.optional(),
  params: emptyObjectSchema.optional(),
  query: clientQuerySchema,
}).strict();

export const getClientSchema = z.object({
  body: emptyObjectSchema.optional(),
  params: clientIdParamsSchema,
  query: emptyObjectSchema.optional(),
}).strict();

export const updateClientSchema = z.object({
  body: updateClientBodySchema,
  params: clientIdParamsSchema,
  query: emptyObjectSchema.optional(),
}).strict();

export const deleteClientSchema = z.object({
  body: emptyObjectSchema.optional(),
  params: clientIdParamsSchema,
  query: emptyObjectSchema.optional(),
}).strict();

export type CreateClientRequest = z.infer<typeof createClientSchema>;
export type ListClientsRequest = z.infer<typeof listClientsSchema>;
export type GetClientRequest = z.infer<typeof getClientSchema>;
export type UpdateClientRequest = z.infer<typeof updateClientSchema>;
export type DeleteClientRequest = z.infer<typeof deleteClientSchema>;
