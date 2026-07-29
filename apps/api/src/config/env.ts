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
  JWT_ISSUER: z.string().min(1).default('teamsynch-ai-api'),
  JWT_ACCESS_AUDIENCE: z.string().min(1).default('teamsynch-ai-api'),
  JWT_REFRESH_AUDIENCE: z.string().min(1).default('teamsynch-ai-auth'),
  ACCESS_TOKEN_EXPIRES_IN: z.string().default('15m'),
  REFRESH_TOKEN_EXPIRES_IN: z
    .string()
    .regex(/^[1-9]\d*[smhd]$/i, 'Refresh token expiration must be a positive duration')
    .default('7d'),
  FRONTEND_URL: z.string().optional(),
  REDIS_URL: z.string().default('redis://localhost:6379'),

  AI_PROVIDER: z.enum(['MOCK', 'OPENAI']).default('MOCK'),
  AI_MODEL: z.string().trim().min(1).optional(),
  OPENAI_API_KEY: z.string().trim().min(1).optional(),
  AI_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
  AI_MAX_OUTPUT_TOKENS: z.coerce.number().int().positive().default(1000),
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
