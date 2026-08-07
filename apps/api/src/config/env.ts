import 'dotenv/config';
import { z } from 'zod';

const DEFAULT_DEV_DB_URL = 'postgresql://postgres:postgres@localhost:5432/teamsynch-ai';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  DATABASE_URL: z.string().default(DEFAULT_DEV_DB_URL),
  DIRECT_DATABASE_URL: z.string().optional(),
  JWT_ACCESS_SECRET: z.string().min(32).optional(),
  JWT_REFRESH_SECRET: z.string().min(32).optional(),
  // BUG FIX (#60): HMAC key for signed storage download URLs. Optional —
  // falls back to JWT_REFRESH_SECRET when unset (see LocalStorageProvider).
  STORAGE_SIGNING_SECRET: z.string().min(32).optional(),
  /*
   * BUG FIX (#106, 2026-08-06 — OAuth tokens "encrypted at rest" with a
   * source-published key): core/utils/encryption.util.ts AES-256-GCMs
   * Google/Outlook calendar tokens before they hit the DB, but when this
   * variable was unset it silently derived its key from a fallback string
   * that LIVES IN THE REPO — and the variable itself was documented
   * NOWHERE (missing from env.ts, both env templates, PRODUCTION.md's
   * required-secrets checklist and the production Compose file). Every
   * operator following the deployment runbook therefore stored real OAuth
   * bearer/refresh credentials under a key anyone with source access can
   * re-derive: encryption theatre, not encryption at rest. It now joins
   * the JWT_* machinery: optional in dev/test (the loudly-named dev
   * fallback in encryption.util stays), REQUIRED in production below and
   * interpolated as mandatory in docker-compose.production.yml so a
   * missing value fails fast at boot, never after tokens are written.
   */
  ENCRYPTION_SECRET_KEY: z
    .string()
    .min(32, 'ENCRYPTION_SECRET_KEY must be at least 32 characters')
    .optional(),
  JWT_ISSUER: z.string().min(1).default('teamsynch-ai-api'),
  JWT_ACCESS_AUDIENCE: z.string().min(1).default('teamsynch-ai-api'),
  JWT_REFRESH_AUDIENCE: z.string().min(1).default('teamsynch-ai-auth'),
  ACCESS_TOKEN_EXPIRES_IN: z.string().default('15m'),
  REFRESH_TOKEN_EXPIRES_IN: z
    .string()
    .regex(/^[1-9]\d*[smhd]$/i, 'Refresh token expiration must be a positive duration')
    .default('7d'),
  FRONTEND_URL: z.string().url('FRONTEND_URL must be a valid URL').optional(),
  REDIS_URL: z.string().default('redis://localhost:6379'),

  AI_PROVIDER: z.enum(['MOCK', 'OPENAI']).default('MOCK'),
  AI_MODEL: z.string().trim().min(1).optional(),
  OPENAI_API_KEY: z.string().trim().min(1).optional(),
  AI_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
  AI_MAX_OUTPUT_TOKENS: z.coerce.number().int().positive().default(1000),
  // FEATURE (ledger #9): real RAG embeddings. AI_EMBEDDING_MODEL and
  // AI_EMBEDDING_DIMS must stay in lockstep with the migrated pgvector
  // column (vector(1536)); OPENAI_BASE_URL enables OpenAI-compatible
  // endpoints (Ollama/vLLM/LiteLLM).
  AI_EMBEDDING_MODEL: z.string().trim().min(1).default('text-embedding-3-small'),
  AI_EMBEDDING_DIMS: z.coerce.number().int().positive().default(1536),
  OPENAI_BASE_URL: z.string().url().optional(),
  // Per-org monthly RAG ingestion token budget (≈ $0.10 at 3-small pricing
  // for 5M tokens) and per-document ingestion cap.
  AI_RAG_MONTHLY_TOKEN_BUDGET: z.coerce.number().int().positive().default(5000000),
  AI_RAG_MAX_CHARS_PER_DOC: z.coerce.number().int().positive().default(250000),
  // FEATURE (ledger #11 — real Stripe subscription plumbing): the
  // price↔plan mapping, operator-configured because price ids differ per
  // Stripe account AND per test/live mode. Optional — billing fail-closes
  // honestly (503) when checkout is attempted without them.
  STRIPE_PRICE_STARTER: z.string().trim().regex(/^price_/, 'must be a Stripe price id (price_...)').optional(),
  STRIPE_PRICE_PRO: z.string().trim().regex(/^price_/, 'must be a Stripe price id (price_...)').optional(),
  STRIPE_PRICE_BUSINESS: z.string().trim().regex(/^price_/, 'must be a Stripe price id (price_...)').optional(),
  // FEATURE (ledger #17 — 2026-08-06): /api/v1/docs exposure policy.
  // 'true'/'false' force the swagger UI on/off in every environment;
  // unset = mounted outside production, WITHHELD in production
  // (secure-by-default). The decision matrix lives in
  // config/api-docs-gate.ts (pure, jest-pinned); app.ts is the only caller.
  ENABLE_API_DOCS: z.string().trim().toLowerCase().optional(),
}).superRefine((env, ctx) => {
  if (env.JWT_ACCESS_AUDIENCE === env.JWT_REFRESH_AUDIENCE) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['JWT_REFRESH_AUDIENCE'],
      message: 'Access and refresh token audiences must be different',
    });
  }

  if (env.NODE_ENV === 'production') {
    if (!env.JWT_ACCESS_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['JWT_ACCESS_SECRET'],
        message: 'JWT_ACCESS_SECRET is required in production',
      });
    }

    if (!env.JWT_REFRESH_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['JWT_REFRESH_SECRET'],
        message: 'JWT_REFRESH_SECRET is required in production',
      });
    }

    // BUG FIX (#106): stored OAuth tokens must not be sealed with the
    // repo-published fallback key — refuse to boot without a real one.
    if (!env.ENCRYPTION_SECRET_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['ENCRYPTION_SECRET_KEY'],
        message:
          'ENCRYPTION_SECRET_KEY is required in production (it AES-256-GCM-encrypts stored calendar OAuth tokens; without it encryption.util silently derives the key from a source-published fallback)',
      });
    }

    if (!env.FRONTEND_URL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['FRONTEND_URL'],
        message: 'FRONTEND_URL is required in production',
      });
    }

    if (env.AI_PROVIDER !== 'OPENAI') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['AI_PROVIDER'],
        message: 'AI_PROVIDER must be OPENAI in production',
      });
    }

    if (!env.AI_MODEL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['AI_MODEL'],
        message: 'AI_MODEL is required in production',
      });
    }

    if (!env.OPENAI_API_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['OPENAI_API_KEY'],
        message: 'OPENAI_API_KEY is required in production',
      });
    }
  }
});

export type Env = z.infer<typeof envSchema>;
// BUG FIX (#106): exported so the production-secrets gate is jest-pinnable
// (config/__tests__/env-production-secrets.test.ts); importing this module
// still runs process validation exactly once, as before.
export { envSchema };
const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Environment validation failed');
  console.table(
    parsed.error.issues.map(issue => ({
      Field: issue.path.join('.'),
      Error: issue.message,
    }))
  );
  process.exit(1);
}

export const env = Object.freeze({
  ...parsed.data,
  JWT_ACCESS_SECRET: parsed.data.JWT_ACCESS_SECRET
    ?? 'development-access-token-secret-change-me',
  JWT_REFRESH_SECRET: parsed.data.JWT_REFRESH_SECRET
    ?? 'development-refresh-token-secret-change-me',
  FRONTEND_URL: parsed.data.FRONTEND_URL ?? 'http://localhost:5173',
});
