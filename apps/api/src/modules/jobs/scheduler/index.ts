import { maintenanceQueue, analyticsQueue } from '../queues';

export const startScheduler = async () => {
  try {
    console.log('Registering recurring scheduled jobs...');

    /*
     * FEATURE (ledger #2, 2026-08-05): processed by cleanupProcessor —
     * description updated to match the APPROVED residue-only scope (the
     * old text claimed 'soft-deleted records' cleanup that has never been
     * in scope; hard-deleting business rows requires a separate policy).
     */
    await maintenanceQueue.add(
      'daily-cleanup',
      { systemTask: true, description: 'Purge operational residue: expired refresh tokens, stale invitations, read notifications (per-class retention windows)' },
      { repeat: { pattern: '0 0 * * *' } }
    );

    /*
     * FEATURE (ledger #5, 2026-08-05): this org-less system payload is the
     * FAN-OUT TRIGGER of the approved weekly design — processed by
     * weeklyAnalyticsFanoutProcessor, which enqueues one tenant-scoped
     * 'weekly-analytics-digest' job per live organization; each digest
     * computes the honest trailing-7-day KPIs and enqueues a
     * WEEKLY_ANALYTICS_DIGEST email per active SUPER_ADMIN. (Until #5 it
     * routed to the #58 logged no-op — the gap was visible but nothing
     * ran.)
     */
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
