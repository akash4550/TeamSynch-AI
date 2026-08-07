import { z } from 'zod';

const emptyObjectSchema = z.object({}).strict();

const assistantQuerySchema = z
  .string()
  .trim()
  .min(1, 'Assistant query is required')
  .max(
    2000,
    'Assistant query cannot exceed 2000 characters',
  );

const globalAssistantBodySchema = z
  .object({
    query: assistantQuerySchema,
    contextType: z.literal('GLOBAL'),
    entityId: z.never().optional(),
  })
  .strict();

const taskAssistantBodySchema = z
  .object({
    query: assistantQuerySchema,
    contextType: z.literal('TASK'),
    entityId: z
      .string()
      .uuid('Task ID must be a valid UUID'),
  })
  .strict();

const projectAssistantBodySchema = z
  .object({
    query: assistantQuerySchema,
    contextType: z.literal('PROJECT'),
    entityId: z
      .string()
      .uuid('Project ID must be a valid UUID'),
  })
  .strict();

export const SummarizeTaskSchema = z
  .object({
    body: emptyObjectSchema.optional(),
    query: emptyObjectSchema,
    params: z
      .object({
        taskId: z
          .string()
          .uuid('Task ID must be a valid UUID'),
      })
      .strict(),
  })
  .strict();

export const AskAssistantSchema = z
  .object({
    body: z.discriminatedUnion('contextType', [
      globalAssistantBodySchema,
      taskAssistantBodySchema,
      projectAssistantBodySchema,
    ]),
    query: emptyObjectSchema,
    params: emptyObjectSchema,
  })
  .strict();

/*
 * BUG FIX (POST /ai/rag/ask accepted an unvalidated body — Bug #38): the
 * RAG endpoint was the ONLY AI route without `validateRequest`, so the
 * controller's `const { query } = req.body` handed ANY payload straight to
 * the provider-calling service: an absent/non-string/empty `query` crashed
 * the embedding call into an opaque 500 (vectorService + LLM both assume a
 * string), and an unbounded body embedded/prompted the AI provider at full
 * token cost — an unauthorised use-of-spend and DoS vector reachable by any
 * tenant member with AI.USE. The contract now mirrors the assistant: a
 * strict `{ query }` body, 1–2000 trimmed characters (same cap as
 * AskAssistantSchema), and nothing else — matching exactly what the web
 * client (WorkspaceAiChatPage) posts.
 */
const ragAskBodySchema = z
  .object({
    query: z
      .string()
      .trim()
      .min(1, 'RAG query is required')
      .max(2000, 'RAG query cannot exceed 2000 characters'),
  })
  .strict();

export const RagAskSchema = z
  .object({
    body: ragAskBodySchema,
    query: emptyObjectSchema,
    params: emptyObjectSchema,
  })
  .strict();

export type SummarizeTaskRequest = z.infer<
  typeof SummarizeTaskSchema
>;

export type AskAssistantRequest = z.infer<
  typeof AskAssistantSchema
>;

export type RagAskRequest = z.infer<typeof RagAskSchema>;