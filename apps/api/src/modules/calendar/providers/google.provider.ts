import {
  CalendarOAuthConfig,
  CalendarOAuthProvider,
  CalendarTokenSet,
  decodeIdTokenEmail,
  exchangeViaTokenEndpoint,
} from './calendar-oauth.provider';

// FEATURE (ledger #3): real Google OAuth2 — authorization-code flow with
// offline access (refresh token) and openid+email so the account email is
// the provider's own claim, not a fabrication.
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'openid',
  'email',
].join(' ');

export class GoogleCalendarOAuthProvider implements CalendarOAuthProvider {
  readonly name = 'GOOGLE' as const;

  buildAuthUrl(config: CalendarOAuthConfig, state: string): string {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      scope: SCOPES,
      state,
      access_type: 'offline',
      prompt: 'consent',
    });
    return `${AUTH_URL}?${params.toString()}`;
  }

  async exchangeCode(
    config: CalendarOAuthConfig,
    code: string
  ): Promise<CalendarTokenSet> {
    const result = await exchangeViaTokenEndpoint(TOKEN_URL, {
      grant_type: 'authorization_code',
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
    });

    if (!result.accessToken) {
      const err = new Error('OAuth token exchange returned no access token');
      (err as any).statusCode = 502;
      throw err;
    }

    const email = decodeIdTokenEmail(result.idToken);
    if (!email) {
      const err = new Error(
        'OAuth account email could not be determined from the provider response'
      );
      (err as any).statusCode = 502;
      throw err;
    }

    return {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      expiresIn: result.expiresIn ?? 3600,
      email,
      scopes: result.scope,
    };
  }
}
