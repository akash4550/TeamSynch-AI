/*
 * BUG FIX (#106, 2026-08-06) pins — the production secrets gate must
 * reject a boot ENCRYPTION_SECRET_KEY-less (previously the API silently
 * AES-256-GCM-sealed stored calendar OAuth tokens with a key published
 * in this repo, and no checklist mentioned the variable), must accept a
 * fully configured production env, and must keep the dev/test fallback
 * untouched. envSchema is exercised directly (additive export from
 * BUG FIX #106) — importing config/env runs process-level validation
 * exactly once, which suites such as inviteToken's already rely on.
 */
import { envSchema } from '../env';

const fullyConfiguredProduction = () => ({
  NODE_ENV: 'production' as const,
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
  FRONTEND_URL: 'https://app.example.com',
  AI_PROVIDER: 'OPENAI' as const,
  AI_MODEL: 'gpt-4o-mini',
  OPENAI_API_KEY: 'sk-live-example',
  ENCRYPTION_SECRET_KEY: 'c'.repeat(32),
});

describe('envSchema production secrets gate (BUG FIX #106)', () => {
  it('REFUSES a production boot without ENCRYPTION_SECRET_KEY (was: silent public-key fallback)', () => {
    const { ENCRYPTION_SECRET_KEY: _omitted, ...withoutKey } =
      fullyConfiguredProduction();

    const result = envSchema.safeParse(withoutKey);

    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((issue) => issue.path.join('.'));
      expect(paths).toContain('ENCRYPTION_SECRET_KEY');
    }
  });

  it('accepts a fully configured production env including ENCRYPTION_SECRET_KEY', () => {
    const result = envSchema.safeParse(fullyConfiguredProduction());

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.ENCRYPTION_SECRET_KEY).toBe('c'.repeat(32));
    }
  });

  it('rejects a too-short ENCRYPTION_SECRET_KEY (min 32, same as JWT secrets)', () => {
    const result = envSchema.safeParse({
      ...fullyConfiguredProduction(),
      ENCRYPTION_SECRET_KEY: 'short',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((issue) => issue.path.join('.'));
      expect(paths).toContain('ENCRYPTION_SECRET_KEY');
    }
  });

  it('keeps ENCRYPTION_SECRET_KEY optional outside production (dev fallback documented)', () => {
    const result = envSchema.safeParse({ NODE_ENV: 'development' });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.ENCRYPTION_SECRET_KEY).toBeUndefined();
    }
  });
});
