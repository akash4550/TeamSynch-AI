import {
  CalendarOAuthConfig,
  CalendarOAuthProvider,
  CalendarTokenSet,
  decodeIdTokenEmail,
  exchangeViaTokenEndpoint,
} from './calendar-oauth.provider';

// FEATURE (ledger #3): real Microsoft identity-platform OAuth2 — the
// Outlook side of the same verified authorization-code flow.
const AUTH_URL =
  'https://login.microsoftonline.com/common/oauth2/v2.0/authorize';
const TOKEN_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
const SCOPES = 'Calendars.ReadWrite offline_access openid email';

export class MicrosoftCalendarOAuthProvider implements CalendarOAuthProvider {
  readonly name = 'OUTLOOK' as const;

  buildAuthUrl(config: CalendarOAuthConfig, state: string): string {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      scope: SCOPES,
      state,
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
