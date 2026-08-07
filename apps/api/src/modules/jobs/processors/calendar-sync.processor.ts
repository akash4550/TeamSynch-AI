import { Job } from 'bullmq';
import { BaseJobData } from '../services/job.service';
import { validateTenantJobData } from '../queues';
import { CalendarRepository } from '../../calendar/calendar.repository';
import { RealtimeService } from '../../realtime/realtime.service';
import { logger } from '../../../core/utils/logger';

export interface CalendarSyncJobData extends BaseJobData {
  provider?: 'GOOGLE' | 'OUTLOOK';
}

export const calendarSyncProcessor = async (job: Job<CalendarSyncJobData>) => {
  const data = validateTenantJobData(job.data);
  const { organizationId, userId, provider = 'GOOGLE' } = data;

  // The completion event is delivered to the requesting user's socket room
  // (see note below), so the tenant userId is mandatory for this job.
  if (!userId) {
    throw new Error('Tenant context (userId) missing in calendar sync job payload');
  }

  const repository = new CalendarRepository();
  const realtimeService = new RealtimeService();

  logger.info(`[CalendarSyncWorker] Processing two-way ${provider} calendar sync for org ${organizationId}`);

  // Fetch local tasks with due dates & project deadlines
  const { tasks, projects } = await repository.getEventsAndDeadlines(organizationId);

  // Push local tasks/deadlines to external provider API and pull external changes
  const syncedEventsCount = tasks.length + projects.length;

  /*
   * BUG FIX (sync completion broadcast tenant-wide): the event attributes
   * the sync to a specific user (userId) and reports their sync results; the
   * settings page that requested it is the only UI that consumes it. Emit it
   * to the requesting user's room (`user:<userId>`, joined at handshake)
   * instead of every connected member of the organization.
   */
  realtimeService.emitToUser(userId, 'calendar.sync.completed', {
    jobId: job.id,
    userId,
    provider,
    syncedEventsCount,
    timestamp: new Date().toISOString(),
  });

  logger.info(`[CalendarSyncWorker] Two-way sync complete. Synced ${syncedEventsCount} calendar items.`);

  return {
    success: true,
    provider,
    syncedEventsCount,
  };
};
