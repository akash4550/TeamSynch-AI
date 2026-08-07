import { describe, expect, it } from '@jest/globals';

import { resolveCalendarApiPublicUrl } from '../calendar-oauth.config';

/*
 * RELEASE GATE (2026-08-07): pins the conditional API_PUBLIC_URL validation
 * that replaced the unconditional localhost fallback:
 *   - development keeps the localhost fallback (zero-friction local OAuth);
 *   - production + no provider credentials → variable stays optional;
 *   - production + Google OR Microsoft configured → explicit, non-loopback,
 *     bare HTTPS origin required (reject unset / localhost / 127.0.0.1 /
 *     http:// / path-bearing values).
 * "Configured" mirrors resolveOAuthConfig: BOTH client id and secret.
 */

const GOOGLE = {
  GOOGLE_CALENDAR_CLIENT_ID: 'gid',
  GOOGLE_CALENDAR_CLIENT_SECRET: 'gsecret',
} as const;

describe('resolveCalendarApiPublicUrl', () => {
  it('development: unset falls back to localhost (zero-friction)', () => {
    expect(resolveCalendarApiPublicUrl({ NODE_ENV: 'development' })).toBe(
      'http://localhost:4000'
    );
  });

  it('development: explicit value is returned with trailing slashes trimmed', () => {
    expect(
      resolveCalendarApiPublicUrl({
        NODE_ENV: 'development',
        API_PUBLIC_URL: 'http://192.168.1.20:4000//',
      })
    ).toBe('http://192.168.1.20:4000');
    // ...and the dev fallback is kept even with a provider configured.
    expect(
      resolveCalendarApiPublicUrl({ NODE_ENV: 'development', ...GOOGLE })
    ).toBe('http://localhost:4000');
  });

  it('production without any provider configured: variable stays optional', () => {
    expect(resolveCalendarApiPublicUrl({ NODE_ENV: 'production' })).toBe(
      'http://localhost:4000'
    );
    // A partially-credentialled provider is NOT "configured"
    // (resolveOAuthConfig needs both id and secret).
    expect(
      resolveCalendarApiPublicUrl({
        NODE_ENV: 'production',
        GOOGLE_CALENDAR_CLIENT_ID: 'gid',
      })
    ).toBe('http://localhost:4000');
  });

  it('production + Google configured: unset API_PUBLIC_URL is rejected', () => {
    expect(() =>
      resolveCalendarApiPublicUrl({ NODE_ENV: 'production', ...GOOGLE })
    ).toThrow(/API_PUBLIC_URL is required in production/);
  });

  it('production + Microsoft configured: unset API_PUBLIC_URL is rejected', () => {
    expect(() =>
      resolveCalendarApiPublicUrl({
        NODE_ENV: 'production',
        MICROSOFT_CALENDAR_CLIENT_ID: 'mid',
        MICROSOFT_CALENDAR_CLIENT_SECRET: 'msecret',
      })
    ).toThrow(/API_PUBLIC_URL is required in production/);
  });

  it('production + provider configured: loopback hosts are rejected', () => {
    for (const bad of [
      'http://localhost:4000',
      'https://localhost',
      'http://127.0.0.1:4000',
      'http://[::1]:4000',
    ]) {
      expect(() =>
        resolveCalendarApiPublicUrl({
          NODE_ENV: 'production',
          ...GOOGLE,
          API_PUBLIC_URL: bad,
        })
      ).toThrow(/loopback|https/);
    }
  });

  it('production + provider configured: plain http:// is rejected (TLS required)', () => {
    expect(() =>
      resolveCalendarApiPublicUrl({
        NODE_ENV: 'production',
        ...GOOGLE,
        API_PUBLIC_URL: 'http://api.example.com',
      })
    ).toThrow(/https:\/\//);
  });

  it('production + provider configured: paths/query are rejected (bare origin only)', () => {
    expect(() =>
      resolveCalendarApiPublicUrl({
        NODE_ENV: 'production',
        ...GOOGLE,
        API_PUBLIC_URL: 'https://api.example.com/api',
      })
    ).toThrow(/bare origin/);
  });

  it('production + provider configured: a valid HTTPS origin is normalized and returned', () => {
    expect(
      resolveCalendarApiPublicUrl({
        NODE_ENV: 'production',
        ...GOOGLE,
        API_PUBLIC_URL: 'https://api.example.com/',
      })
    ).toBe('https://api.example.com');
  });
});
