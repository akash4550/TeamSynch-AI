/*
 * BUG FIX (#107, 2026-08-06 — the seed script was an unguarded
 * full-database wipe): `npm run seed` executed 19 un-scoped deleteMany()
 * calls across EVERY table (organizations, users, refresh tokens, audit
 * logs…) with no environment check, no host check and no confirmation,
 * while its own comment claimed it only cleaned "seed records" and
 * README carried a docs-only "never run it against production" warning —
 * i.e. the entire blast radius depended on operator memory at 2am, in a
 * codebase that rightly demands type-the-exact-name confirmation to
 * delete a single TEAM (TeamDetailsPage).
 *
 * This module is the enforcement, kept pure (no Prisma import) so the
 * policy is jest-pinnable in prisma/__tests__/seed-guard.test.ts:
 *   1. NODE_ENV=production            → refuse, no override (nothing
 *                                       legitimate seeds production);
 *   2. DATABASE_URL missing/malformed → fail CLOSED (the script cannot
 *                                       be reasoned about — say so);
 *   3. loopback database host         → the documented dev README flow,
 *                                       zero friction;
 *   4. any other host (staging, RDS, Neon, a shell whose DATABASE_URL
 *      was left pointed at prod)     → require typed confirmation:
 *      SEED_CONFIRM_DATABASE must exactly equal the database name parsed
 *      from the URL — the CLI equivalent of the app's own type-to-confirm.
 */
export interface SeedGuardEnv {
  NODE_ENV?: string;
  DATABASE_URL?: string;
  SEED_CONFIRM_DATABASE?: string;
}

export class SeedTargetRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SeedTargetRefused';
  }
}

const LOOPBACK_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '::1',
  '[::1]', // URL.hostname keeps the brackets for IPv6 literals
]);

export const assertSeedTargetSafe = (env: SeedGuardEnv): void => {
  if (env.NODE_ENV === 'production') {
    throw new SeedTargetRefused(
      'Seed refused: NODE_ENV=production. The seed script wipes every row in every table and inserts demonstration data; it must never run against a production deployment.',
    );
  }

  if (!env.DATABASE_URL) {
    throw new SeedTargetRefused(
      'Seed refused: DATABASE_URL is not set, so the wipe target cannot be verified. Set DATABASE_URL explicitly to the database you intend to reset.',
    );
  }

  let url: URL;
  try {
    url = new URL(env.DATABASE_URL);
  } catch {
    throw new SeedTargetRefused(
      `Seed refused: DATABASE_URL could not be parsed as a URL (starts with "${env.DATABASE_URL.slice(0, 12)}…"). Fix the URL or export a well-formed postgresql:// connection string.`,
    );
  }

  const host = url.hostname.toLowerCase();
  if (LOOPBACK_HOSTS.has(host)) {
    return; // documented local-development flow
  }

  const databaseName = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (!databaseName) {
    throw new SeedTargetRefused(
      `Seed refused: DATABASE_URL for host "${host}" names no database, so the wipe target cannot be verified.`,
    );
  }

  if (env.SEED_CONFIRM_DATABASE !== databaseName) {
    throw new SeedTargetRefused(
      `Seed refused: the target database "${databaseName}" is on non-loopback host "${host}". This script deletes EVERY row in EVERY table before inserting demonstration data. If you really intend to wipe "${databaseName}", re-run with SEED_CONFIRM_DATABASE=${databaseName} in the environment.`,
    );
  }
};
