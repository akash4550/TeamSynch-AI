import { maintenanceQueue, analyticsQueue } from '../queues';

export const startScheduler = async () => {
  try {
    console.log('Registering recurring scheduled jobs...');

    await maintenanceQueue.add(
      'daily-cleanup',
      { systemTask: true, description: 'Clean up expired refresh tokens and soft-deleted records' },
      { repeat: { pattern: '0 0 * * *' } }
    );

    await analyticsQueue.add(
      'weekly-analytics-refresh',
      { systemTask: true, reportType: 'WEEKLY_SUMMARY' },
      { repeat: { pattern: '0 1 * * 0' } }
    );

    console.log('Scheduled jobs registered successfully.');
  } catch (error: any) {
    console.warn('[Scheduler] Skipping background scheduled job registration (Redis unavailable):', error.message);
  }
};
