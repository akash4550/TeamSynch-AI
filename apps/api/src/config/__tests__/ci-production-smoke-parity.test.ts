/*
 * BUG FIX (#109, 2026-08-06) pins — gate/workflow parity: env.ts refuses
 * to boot in production without a set of required variables (JWT pair,
 * FRONTEND_URL, OPENAI trio, and — since BUG FIX #106 —
 * ENCRYPTION_SECRET_KEY), and the CI "production-smoke" job boots the
 * REAL production compose topology. #106 added a required key without
 * updating that job, which would have failed the NEXT main-branch run at
 * Compose interpolation time (a broken pipeline discovered only in CI).
 * This suite locks the parity: every production-required variable must
 * appear in the smoke job's env block, and the value wired for
 * ENCRYPTION_SECRET_KEY must satisfy the schema's ≥32-chars rule.
 * Textual extraction (no yaml dependency needed — the job block is
 * delimited deterministically).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// jest rootDir is apps/api; the workflow lives at the repository root.
const workflowPath = resolve(
  __dirname,
  '../../../../../.github/workflows/ci.yml',
);
const workflow = readFileSync(workflowPath, 'utf8');

const smokeJobStart = workflow.indexOf('production-smoke:');
const stepsStart =
  smokeJobStart === -1 ? -1 : workflow.indexOf('steps:', smokeJobStart);
const smokeJobEnvBlock =
  smokeJobStart !== -1 && stepsStart > smokeJobStart
    ? workflow.slice(smokeJobStart, stepsStart)
    : '';

const PRODUCTION_REQUIRED_KEYS = [
  'JWT_ACCESS_SECRET',
  'JWT_REFRESH_SECRET',
  'FRONTEND_URL',
  'AI_PROVIDER',
  'AI_MODEL',
  'OPENAI_API_KEY',
  'ENCRYPTION_SECRET_KEY', // BUG FIX #106/#109 — the one that broke parity
] as const;

describe('CI production-smoke ↔ env.ts production-gate parity (BUG FIX #109)', () => {
  it('locates the production-smoke job env block in ci.yml', () => {
    expect(smokeJobStart).toBeGreaterThan(-1);
    expect(stepsStart).toBeGreaterThan(smokeJobStart);
    expect(smokeJobEnvBlock).toContain('env:');
  });

  it.each(PRODUCTION_REQUIRED_KEYS)(
    'smoke job env provides %s (required for any production boot)',
    (key) => {
      expect(smokeJobEnvBlock).toContain(`${key}:`);
    },
  );

  it('smoke ENCRYPTION_SECRET_KEY satisfies the ≥32-char schema rule and differs from JWT placeholders', () => {
    const match = smokeJobEnvBlock.match(
      /ENCRYPTION_SECRET_KEY:\s*(\S+)/,
    );
    expect(match).not.toBeNull();
    const value = match![1];
    expect(value.length).toBeGreaterThanOrEqual(32);
    expect(value).not.toBe('ci-production-access-secret-change-me');
    expect(value).not.toBe('ci-production-refresh-secret-change-me');
  });

  it('production compose interpolates ENCRYPTION_SECRET_KEY as mandatory (:?)', () => {
    const compose = readFileSync(
      resolve(__dirname, '../../../../../docker-compose.production.yml'),
      'utf8',
    );
    expect(compose).toContain(
      '${ENCRYPTION_SECRET_KEY:?ENCRYPTION_SECRET_KEY is required}',
    );
  });
});
