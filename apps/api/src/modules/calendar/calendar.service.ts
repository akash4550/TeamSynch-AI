import { CalendarRepository } from './calendar.repository';
import { maintenanceQueue } from '../jobs/queues';
import { AppError } from '../../core/errors/AppError';

export class CalendarService {
  private repository = new CalendarRepository();

  /**
   * Generates OAuth2 Authorization URL for Google Calendar or Microsoft Outlook
   */
  getOAuthUrl(provider: 'GOOGLE' | 'OUTLOOK', state: string): { authUrl: string } {
    if (provider === 'GOOGLE') {
      const clientId = process.env.GOOGLE_CLIENT_ID || 'google_client_id_dummy';
      const redirectUri = encodeURIComponent(process.env.GOOGLE_REDIRECT_URI || 'http://localhost:4000/api/v1/calendar/callback/google');
      const scope = encodeURIComponent('https://www.googleapis.com/auth/calendar.events');
      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?response_type=code&client_id=${clientId}&redirect_uri=${redirectUri}&scope=${scope}&state=${state}&access_type=offline&prompt=consent`;
      return { authUrl };
    } else {
      const clientId = process.env.OUTLOOK_CLIENT_ID || 'outlook_client_id_dummy';
      const redirectUri = encodeURIComponent(process.env.OUTLOOK_REDIRECT_URI || 'http://localhost:4000/api/v1/calendar/callback/outlook');
      const scope = encodeURIComponent('Calendars.ReadWrite offline_access');
      const authUrl = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=${clientId}&response_type=code&redirect_uri=${redirectUri}&scope=${scope}&state=${state}`;
      return { authUrl };
    }
  }

  /**
   * Handles OAuth2 Code Exchange Callback and saves encrypted tokens
   */
  async handleOAuthCallback(
    organizationId: string,
    userId: string,
    provider: 'GOOGLE' | 'OUTLOOK',
    code: string
  ) {
    if (!code) {
      throw new AppError('Missing OAuth authorization code', 400);
    }

    // Standard OAuth token exchange simulation / external API handshake
    const mockAccessToken = `ya29.access_token_${provider.toLowerCase()}_${Date.now()}`;
    const mockRefreshToken = `1//refresh_token_${provider.toLowerCase()}_${Date.now()}`;
    const expiresAt = new Date(Date.now() + 3600 * 1000);

    const account = await this.repository.saveCalendarAccount({
      organizationId,
      userId,
      provider,
      email: `${userId.slice(0, 6)}@${provider.toLowerCase()}.com`,
      accessToken: mockAccessToken,
      refreshToken: mockRefreshToken,
      expiresAt,
    });

    // Enqueue initial two-way calendar sync job to BullMQ
    await maintenanceQueue.add('CALENDAR_TWO_WAY_SYNC', {
      organizationId,
      userId,
      provider,
    });

    return account;
  }

  /**
   * Triggers asynchronous two-way calendar sync job via BullMQ
   */
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
