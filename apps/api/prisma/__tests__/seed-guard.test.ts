/*
 * BUG FIX (#107, 2026-08-06) pins — the seed wipe target gate:
 * production is refused unconditionally, unverifiable targets fail
 * closed, loopback keeps the documented dev flow zero-friction, and any
 * remote host demands SEED_CONFIRM_DATABASE equal to the exact database
 * name parsed from the URL (the CLI's type-to-confirm).
 */
import {
  assertSeedTargetSafe,
  SeedTargetRefused,
} from '../seed-guard';

describe('assertSeedTargetSafe (BUG FIX #107)', () => {
  it('refuses NODE_ENV=production outright — even for a loopback URL with confirmation', () => {
    expect(() =>
      assertSeedTargetSafe({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://u:p@localhost:5432/teamsynch-ai',
        SEED_CONFIRM_DATABASE: 'teamsynch-ai',
      }),
    ).toThrow(SeedTargetRefused);
    expect(() =>
      assertSeedTargetSafe({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://u:p@db.prod.internal:5432/teamsynch_prod',
      }),
    ).toThrow(/NODE_ENV=production/);
  });

  it('fails closed when DATABASE_URL is unset', () => {
    expect(() =>
      assertSeedTargetSafe({ NODE_ENV: 'development' }),
    ).toThrow(/DATABASE_URL is not set/);
  });

  it('fails closed when DATABASE_URL is not a parseable URL', () => {
    expect(() =>
      assertSeedTargetSafe({
        NODE_ENV: 'development',
        DATABASE_URL: 'not a url at all',
      }),
    ).toThrow(/could not be parsed/);
  });

  it('allows the documented localhost developer flow with no confirmation', () => {
    expect(() =>
      assertSeedTargetSafe({
        NODE_ENV: 'development',
        DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/teamsynch-ai',
      }),
    ).not.toThrow();
  });

  it('allows 127.0.0.1 loopback with no confirmation', () => {
    expect(() =>
      assertSeedTargetSafe({
        DATABASE_URL: 'postgresql://u:p@127.0.0.1:5432/teamsynch-ai',
      }),
    ).not.toThrow();
  });

  it('refuses a remote host without SEED_CONFIRM_DATABASE and names the parsed target', () => {
    expect(() =>
      assertSeedTargetSafe({
        NODE_ENV: 'development',
        DATABASE_URL: 'postgresql://u:p@ep-cool-123.eu-central-1.aws.neon.tech/prod_db',
      }),
    ).toThrow(/"prod_db" is on non-loopback host/);
  });

  it('refuses a remote host when the confirmation does not match the database name exactly', () => {
    expect(() =>
      assertSeedTargetSafe({
        DATABASE_URL: 'postgresql://u:p@db.example.com:5432/prod_db',
        SEED_CONFIRM_DATABASE: 'prod-db',
      }),
    ).toThrow(SeedTargetRefused);
  });

  it('allows a remote host only when SEED_CONFIRM_DATABASE exactly matches', () => {
    expect(() =>
      assertSeedTargetSafe({
        DATABASE_URL: 'postgresql://u:p@staging.internal:5432/teamsynch_staging',
        SEED_CONFIRM_DATABASE: 'teamsynch_staging',
      }),
    ).not.toThrow();
  });

  it('treats docker-style service hostnames as remote (must confirm, not assume dev)', () => {
    expect(() =>
      assertSeedTargetSafe({
        DATABASE_URL: 'postgresql://u:p@postgres:5432/teamsynch-ai',
      }),
    ).toThrow(SeedTargetRefused);
    expect(() =>
      assertSeedTargetSafe({
        DATABASE_URL: 'postgresql://u:p@postgres:5432/teamsynch-ai',
        SEED_CONFIRM_DATABASE: 'teamsynch-ai',
      }),
    ).not.toThrow();
  });

  it('fails closed when the URL names no database at all', () => {
    expect(() =>
      assertSeedTargetSafe({
        DATABASE_URL: 'postgresql://u:p@db.example.com:5432/',
      }),
    ).toThrow(/names no database/);
  });
});
