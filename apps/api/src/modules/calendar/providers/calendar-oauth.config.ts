import { CalendarOAuthConfig, CalendarOAuthProvider } from './calendar-oauth.provider';
import { GoogleCalendarOAuthProvider } from './google.provider';
import { MicrosoftCalendarOAuthProvider } from './microsoft.provider';

/*
 * FEATURE (ledger #3): fail-CLOSED credential resolution. The simulated
 * flow silently substituted `google_client_id_dummy` when env vars were
 * missing and fabricated the rest — the real flow instead tells the admin
 * honestly that the provider is not configured on this deployment (503
 * from the service layer). Redirect URLs derive from API_PUBLIC_URL so
 * provider app registrations match deployment reality.
 *
 * RELEASE GATE (2026-08-07 — production OAuth origin): the localhost
 * fallback is development-only. In production API_PUBLIC_URL stays
 * OPTIONAL while no provider carries client credentials (the feature then
 * degrades to honest 503s and the origin is never used), but the moment
 * either provider is configured the redirect URIs must be built from an
 * explicit, non-loopback HTTPS origin — a silent localhost/http fallback
 * would register and send users to a dead or insecure callback URL.
 */
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

// Exported pure resolver (default arg keeps call sites test-free; focused
// pins live in providers/__tests__/calendar-oauth-origin.test.ts).
export const resolveCalendarApiPublicUrl = (
  env: NodeJS.ProcessEnv = process.env
): string => {
  const raw = (env.API_PUBLIC_URL ?? '').trim();
  const isProduction = env.NODE_ENV === 'production';
  // "Configured" mirrors resolveOAuthConfig exactly: BOTH id and secret.
  const anyProviderConfigured = Boolean(
    (env.GOOGLE_CALENDAR_CLIENT_ID && env.GOOGLE_CALENDAR_CLIENT_SECRET) ||
    (env.MICROSOFT_CALENDAR_CLIENT_ID && env.MICROSOFT_CALENDAR_CLIENT_SECRET)
  );
  const gateApplies = isProduction && anyProviderConfigured;

  if (!raw) {
    if (gateApplies) {
      throw new Error(
        'API_PUBLIC_URL is required in production when a calendar OAuth provider is configured (the OAuth redirect URIs are built from it). Set it to the externally reachable HTTPS API origin, e.g. https://api.example.com, matching the provider console registrations.'
      );
    }
    return 'http://localhost:4000';
  }

  const trimmed = raw.replace(/\/+$/, '');
  if (!gateApplies) return trimmed; // dev, or prod with the feature unused

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error(`API_PUBLIC_URL must be a valid URL origin in production (received "${raw}").`);
  }
  if (url.protocol !== 'https:') {
    throw new Error(
      `API_PUBLIC_URL must use https:// in production (received "${raw}") — OAuth providers require TLS redirect URIs.`
    );
  }
  if (LOOPBACK_HOSTS.has(url.hostname)) {
    throw new Error(`API_PUBLIC_URL must not point at a loopback host in production (received "${raw}").`);
  }
  if (url.origin !== trimmed) {
    throw new Error(
      `API_PUBLIC_URL must be a bare origin (scheme + host + optional port) in production — no paths or query strings (received "${raw}").`
    );
  }
  return url.origin;
};

const apiPublicUrl = (): string => resolveCalendarApiPublicUrl(process.env);

export const getOAuthProvider = (
  provider: 'GOOGLE' | 'OUTLOOK'
): CalendarOAuthProvider =>
  provider === 'GOOGLE'
    ? new GoogleCalendarOAuthProvider()
    : new MicrosoftCalendarOAuthProvider();

/**
 * Returns null when the deployment has no credentials for this provider —
 * the service turns that into an honest 503 instead of a dummy URL.
 */
export const resolveOAuthConfig = (
  provider: 'GOOGLE' | 'OUTLOOK'
): CalendarOAuthConfig | null => {
  if (provider === 'GOOGLE') {
    const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET;

    if (!clientId || !clientSecret) return null;

    return {
      clientId,
      clientSecret,
      redirectUri: `${apiPublicUrl()}/api/v1/calendar/callback/google`,
    };
  }

  const clientId = process.env.MICROSOFT_CALENDAR_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CALENDAR_CLIENT_SECRET;

  if (!clientId || !clientSecret) return null;

  return {
    clientId,
    clientSecret,
    redirectUri: `${apiPublicUrl()}/api/v1/calendar/callback/outlook`,
  };
};
