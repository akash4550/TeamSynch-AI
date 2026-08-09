import { z } from 'zod';

const emptyObjectSchema = z.object({}).strict();

/**
 * AI usage analytics (ledger #21 — 2026-08-09): org-scoped, read-only
 * summary of AIUsageLog activity over a trailing window. Only the
 * bounded `days` query parameter is accepted.
 */
export const AI_USAGE_MAX_DAYS = 90;
export const AI_USAGE_DEFAULT_DAYS = 30;

export const GetAIUsageSchema = z
  .object({
    body: emptyObjectSchema.optional(),
    query: z
      .object({
        days: z.coerce
          .number()
          .int('days must be an integer')
          .min(1, 'days must be at least 1')
          .max(AI_USAGE_MAX_DAYS, `days must be at most ${AI_USAGE_MAX_DAYS}`)
          .optional(),
      })
      .strict(),
    params: emptyObjectSchema.optional(),
  })
  .strict();

export type GetAIUsageRequest = z.infer<typeof GetAIUsageSchema>;
