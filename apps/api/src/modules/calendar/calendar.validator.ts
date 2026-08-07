import { z } from 'zod';

const emptyObjectSchema = z.object({}).strict();

export const getCalendarFeedSchema = z.object({
  body: emptyObjectSchema.optional(),
  params: emptyObjectSchema.optional(),
  query: emptyObjectSchema.optional(),
});

// NOTE (Bug #59 dead-code sweep): `createCalendarEventSchema` was removed —
// it was an identical copy of getCalendarFeedSchema with zero importers
// anywhere in the repo (verified by census). The CalendarEvent model is a
// stub and no event-creation route exists; when one is added, it should
// carry a REAL body schema (title/start/end/attendees), not a strict-empty
// passthrough like this placeholder did.

/*
 * FEATURE (ledger #3 — real OAuth): connect asks for a provider; the
 * callback carries provider + code + HMAC state (signature/TTL/match are
 * verified in the service); disconnect names the provider in the path.
 */
const providerQuerySchema = z.object({
  provider: z.enum(['GOOGLE', 'OUTLOOK']).optional(),
}).strict();

export const connectCalendarSchema = z.object({
  body: z.object({}).strict().optional(),
  params: z.object({}).strict(),
  query: providerQuerySchema,
}).strict();

export const oauthCallbackSchema = z.object({
  body: z.object({}).strict().optional(),
  params: z.object({
    provider: z.enum(['google', 'outlook']),
  }).strict(),
  query: z.object({
    code: z.string().min(1).optional(),
    state: z.string().min(10),
    error: z.string().optional(),
    error_description: z.string().optional(),
  }).strict(),
}).strict();

export const listAccountsSchema = z.object({
  body: z.object({}).strict().optional(),
  params: z.object({}).strict(),
  query: z.object({}).strict().optional(),
}).strict();

export const disconnectAccountSchema = z.object({
  body: z.object({}).strict().optional(),
  params: z.object({
    provider: z.enum(['GOOGLE', 'OUTLOOK']),
  }).strict(),
  query: z.object({}).strict().optional(),
}).strict();
