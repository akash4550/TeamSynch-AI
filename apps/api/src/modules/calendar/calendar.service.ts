import { CalendarProvider } from '@prisma/client';

import { CalendarRepository } from './calendar.repository';
import { maintenanceQueue } from '../jobs/queues';
import { AppError } from '../../core/errors/AppError';
import { encryptToken } from '../../core/utils/encryption.util';
import {
  createOAuthState,
  isOAuthStateExpired,
  verifyOAuthState,
} from '../../core/utils/oauthState';
import {
  getOAuthProvider,
  resolveOAuthConfig,
} from './providers/calendar-oauth.config';

const PROVIDERS: readonly string[] = ['GOOGLE', 'OUTLOOK'];

export const isCalendarProvider = (
  value: string
): value is CalendarProvider => PROVIDERS.includes(value);

export class CalendarService {
  private repository = new CalendarRepository();

  /*
   * FEATURE (ledger #3, 2026-08-05 — REAL OAuth replaces the simulation):
   * previously this minted an auth URL with a dummy client id whenever env
   * was missing, signed nothing, and never verified state — and the
   * callback fabricated tokens/emails into a shell CalendarEvent row.
   * Now: fail-closed credential resolution (honest 503 when the provider
   * is not configured on this deployment) and an HMAC-signed, 10-minute
   * state credential (core/utils/oauthState.ts).
   */
  getOAuthUrl(
    provider: CalendarProvider,
    organizationId: string,
    userId: string
  ): { authUrl: string; stateExpiresAt: string } {
    const config = resolveOAuthConfig(provider);

    if (!config) {
      throw new AppError(
        `${provider === 'GOOGLE' ? 'Google' : 'Microsoft'} Calendar is not configured on this deployment (missing ${provider === 'GOOGLE' ? 'GOOGLE_CALENDAR_CLIENT_ID/SECRET' : 'MICROSOFT_CALENDAR_CLIENT_ID/SECRET'})`,
        503
      );
    }

    const { state, expiresAtMs } = createOAuthState(
      organizationId,
      userId,
      provider
    );

    return {
      authUrl: getOAuthProvider(provider).buildAuthUrl(config, state),
      stateExpiresAt: new Date(expiresAtMs).toISOString(),
    };
  }

  /*
   * FEATURE (ledger #3): the callback is browser-delivered (the provider
   * redirects the admin's browser to the API — no session bearer token is
   * attached), so the VERIFIED STATE is the credential. Defense order:
   * signature -> TTL -> provider match -> real code exchange. The account
   * email is the provider id_token claim, tokens are AES-256-GCM
   * encrypted BEFORE the upsert (the old code discarded the ciphertext),
   * and reconnects rotate the single row instead of duplicating accounts.
   */
  async handleOAuthCallback(
    pathProvider: CalendarProvider,
    code: string,
    state: string
  ) {
    if (!code) {
      throw new AppError('Missing OAuth authorization code', 400);
    }

    const parts = verifyOAuthState(state);
    if (!parts) {
      throw new AppError('Invalid OAuth state — please restart the connection flow', 400);
    }

    if (isOAuthStateExpired(parts)) {
      throw new AppError('OAuth state expired — please restart the connection flow', 410);
    }

    if (parts.provider !== pathProvider) {
      throw new AppError('OAuth state/provider mismatch', 400);
    }

    const config = resolveOAuthConfig(pathProvider);
    if (!config) {
      throw new AppError(
        'This calendar provider is not configured on this deployment',
        503
      );
    }

    const tokens = await getOAuthProvider(pathProvider).exchangeCode(
      config,
      code
    );

    const account = await this.repository.upsertCalendarAccount({
      organizationId: parts.organizationId,
      userId: parts.userId,
      provider: pathProvider,
      email: tokens.email,
      accessToken: encryptToken(tokens.accessToken),
      refreshToken: tokens.refreshToken
        ? encryptToken(tokens.refreshToken)
        : null,
      accessTokenExpiresAt: new Date(
        Date.now() + tokens.expiresIn * 1000
      ),
      scopes: tokens.scopes,
    });

    // Kick the initial two-way sync through the same queue boundary
    // (the sync worker remains the documented simulation boundary).
    await maintenanceQueue.add('CALENDAR_TWO_WAY_SYNC', {
      organizationId: parts.organizationId,
      userId: parts.userId,
      provider: pathProvider,
    });

    return {
      provider: account.provider,
      email: account.email,
      userId: account.userId,
    };
  }

  /** Session-scoped list: connected accounts WITHOUT token material. */
  async listAccounts(organizationId: string, userId: string) {
    return this.repository.listCalendarAccounts(organizationId, userId);
  }

  /** Session-scoped disconnect; honest 404 when nothing was linked. */
  async disconnectAccount(
    organizationId: string,
    userId: string,
    provider: CalendarProvider
  ) {
    const deleted = await this.repository.deleteCalendarAccount(
      organizationId,
      userId,
      provider
    );

    if (deleted.count === 0) {
      throw new AppError('No connected account found for this provider', 404);
    }

    return { disconnected: true, provider };
  }

  async triggerTwoWaySync(organizationId: string, userId: string) {
    const job = await maintenanceQueue.add('CALENDAR_TWO_WAY_SYNC', {
      organizationId,
      userId,
    });

    return {
      jobId: job.id,
      status: 'QUEUED',
      message: 'Two-way calendar sync queued asynchronously.',
      checkStatusUrl: `/api/v1/jobs/${job.id}`,
    };
  }

  async getCalendarFeed(organizationId: string) {
    return this.repository.getEventsAndDeadlines(organizationId);
  }
}
