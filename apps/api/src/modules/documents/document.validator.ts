import { z } from 'zod';

export const uploadDocumentSchema = z.object({
  projectId: z.string().uuid().optional(),
  taskId: z.string().uuid().optional(),
});

export const renameDocumentSchema = z.object({
  fileName: z.string().min(1).max(255),
});

export const moveDocumentSchema = z.object({
  projectId: z.string().uuid().optional(),
  taskId: z.string().uuid().optional(),
});

/*
 * BUG FIX (#112, 2026-08-06 — the codebase's last UNVALIDATED list-query
 * route): GET /documents forwarded raw `req.query` straight into the
 * repository's Prisma call, while every other list endpoint (tasks,
 * projects, teams, all six CRM resources) runs allowlisted zod query
 * schemas. Three honest-failure classes flowed from that:
 *   1. `?sortBy=garbage` (or sortOrder=garbage) reached
 *      `orderBy: { [sortBy]: sortOrder }` → PrismaClientValidationError →
 *      an opaque generic 500 instead of an honest 400 (the exact class
 *      closed for bodies in BUG FIX #43 and for pipeline stages in #62);
 *   2. `?page=abc` / `?limit=abc` produced NaN `skip`/`take` → same
 *      opaque-500 outcome;
 *   3. `?limit=99999999` was ACCEPTED — an unbounded `take` plus the
 *      uploadedBy join is a read-amplification DoS lever for any
 *      authenticated user (tasks caps at 500; this now caps at 100).
 * `search` deliberately tolerates '' — the live DocumentsPage sends
 * `search=` on its initial render, and the repository's truthiness guard
 * treats '' as "no filter" (verified 2026-08-06; a min(1) here would
 * 400 the page's own steady-state request). The sortBy domain mirrors
 * the long-declared DocumentQueryDto union exactly.
 */
export const listDocumentsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().trim().max(200).optional(),
  projectId: z.string().uuid().optional(),
  taskId: z.string().uuid().optional(),
  sortBy: z.enum(['fileName', 'createdAt', 'fileSize']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});
