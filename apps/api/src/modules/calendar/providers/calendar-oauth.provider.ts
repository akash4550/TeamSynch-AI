/*
 * FEATURE (ledger #3): real OAuth2 provider abstraction. Uses ONLY the
 * global fetch (Node >= 18) — zero new dependencies, so the exchange is
 * genuinely live whenever credentials are configured.
 */

export interface CalendarOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface CalendarTokenSet {
  accessToken: string;
  refreshToken?: string;
  /** Seconds-to-live reported by the provider. */
  expiresIn: number;
  /** Real account email read from the provider id_token — never fabricated. */
  email: string;
  scopes?: string;
}

export interface CalendarOAuthProvider {
  readonly name: 'GOOGLE' | 'OUTLOOK';
  buildAuthUrl(config: CalendarOAuthConfig, state: string): string;
  exchangeCode(
    config: CalendarOAuthConfig,
    code: string
  ): Promise<CalendarTokenSet>;
}

/** Standard "decode the id_token we just received over TLS from the token
 *  endpoint itself" — payload-only parse (transport-authentic by design). */
export const decodeIdTokenEmail = (
  idToken: string | undefined
): string | null => {
  if (!idToken) return null;
  const parts = idToken.split('.');
  if (parts.length !== 3) return null;

  try {
    const payload = JSON.parse(
      Buffer.from(parts[1], 'base64url').toString('utf8')
    );
    return typeof payload.email === 'string' && payload.email.length > 0
      ? payload.email
      : null;
  } catch {
    return null;
  }
};

export const exchangeViaTokenEndpoint = async (
  tokenUrl: string,
  body: Record<string, string>
): Promise<{
  accessToken?: string;
  refreshToken?: string;
  idToken?: string;
  expiresIn?: number;
  scope?: string;
  error?: string;
}> => {
  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString(),
  });

  const json = (await response.json().catch(() => ({}))) as any;

  if (!response.ok) {
    const reason =
      typeof json?.error_description === 'string'
        ? json.error_description
        : typeof json?.error === 'string'
          ? json.error
          : `HTTP ${response.status}`;
    const err = new Error(`OAuth token exchange failed: ${reason}`);
    (err as any).statusCode = 502;
    throw err;
  }

  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    idToken: json.id_token,
    expiresIn: typeof json.expires_in === 'number' ? json.expires_in : 3600,
    scope: json.scope,
  };
};
