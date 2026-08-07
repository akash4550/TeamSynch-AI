import { Job } from 'bullmq';

import { prisma } from '../../../config/prisma';
import { logger } from '../../../core/utils/logger';
import { AnalyticsRepository } from '../../analytics/analytics.repository';
import { KPIEngine } from '../../analytics/kpi.engine';
import { analyticsQueue, emailQueue } from '../queues';

/*
 * FEATURE (ledger #5, 2026-08-05 — weekly-analytics-refresh design,
 * APPROVED via product decision: per-org fan-out · weekly digest email ·
 * SUPER_ADMIN recipients).
 *
 * Until now the Sunday 01:00 system cron was a guaranteed no-op: routed
 * around the org-less payload to a logged skip in BUG FIX (#58). This is
 * the real design that replaces the skip FOR THIS JOB NAME ONLY — the #58
 * no-op remains the honest state for any other unknown system job:
 *
 *   weekly-analytics-refresh (system, org-less BY DESIGN)
 *     → fan-out: one 'weekly-analytics-digest' job per live organization
 *       on this same ANALYTICS queue (per-tenant retry isolation — one
 *       org's failure can never delay or kill the others, matching the
 *       validateTenantJobData tenant-isolation model)
 *     → digest: compute the trailing-7-day KPI window plus as-of-now
 *       snapshots through the REAL KPIEngine (post-#4 definitions:
 *       TASKS_COMPLETED matches completedAt, WIN_RATE counts decided
 *       deals only, PIPELINE_VALUE counts open pipeline only)
 *     → email: one individually-addressed WEEKLY_ANALYTICS_DIGEST email
 *       job per ACTIVE SUPER_ADMIN of the org (TEAM_INVITATION precedent)
 *       on the EMAIL queue — the documented transport boundary every
 *       outbound mail in this stack uses.
 *
 * Nothing is persisted: like the invitations module, the email queue IS
 * the delivery channel until the transport ships for real.
 */

const WINDOW_DAYS = 7;

export const weeklyAnalyticsFanoutProcessor = async (job: Job) => {
  // Only live tenants: a soft-deleted or deactivated org gets no digest
  // (same "live rows only" convention every read elsewhere enforces).
  const organizations = await prisma.organization.findMany({
    where: {
      isActive: true,
      deletedAt: null,
    },
    select: {
      id: true,
    },
    orderBy: {
      createdAt: 'asc',
    },
  });

  for (const organization of organizations) {
    await analyticsQueue.add('weekly-analytics-digest', {
      organizationId: organization.id,
      fannedOutBy: job.id ?? 'scheduler',
    });
  }

  logger.info('Weekly analytics fan-out complete', {
    jobId: job.id,
    organizations: organizations.length,
  });

  return { success: true, fannedOut: organizations.length };
};

export const weeklyAnalyticsDigestProcessor = async (job: Job) => {
  const { organizationId } = job.data as { organizationId?: string };
  if (!organizationId) {
    // Same tenant-guard contract as analyticsProcessor (#58): org-scoped
    // work without tenant context is a hard error, never a silent skip —
    // only 'weekly-analytics-refresh' is allowed to be org-less, and the
    // dispatcher routes that name to the fan-out above before this check
    // can ever see it.
    throw new Error('Tenant context missing for weekly analytics digest');
  }

  const kpiEngine = new KPIEngine(new AnalyticsRepository());

  const endDate = new Date();
  const startDate = new Date(
    endDate.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000,
  );
  const windowFilters = {
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
  };

  // Trailing-7-day window metrics (counting windows are honestly
  // attributed since ledger #4: completed matches completion date).
  const windowedNames = [
    'TASKS_CREATED',
    'TASKS_COMPLETED',
    'NEW_USERS',
    'LEADS_CREATED',
  ] as const;
  const windowedMetrics: Record<string, number | string> = {};
  for (const name of windowedNames) {
    const result = await kpiEngine.calculateMetric(
      name,
      organizationId,
      windowFilters,
    );
    windowedMetrics[name] = result.value as number;
  }

  // As-of-now snapshots (no window): live counts and all-time decided-deal
  // ratios are more decision-useful in a weekly digest than 7-day slivers.
  const snapshotNames = [
    'OVERDUE_TASKS',
    'PIPELINE_VALUE',
    'WIN_RATE',
  ] as const;
  const snapshotMetrics: Record<string, number | string> = {};
  for (const name of snapshotNames) {
    const result = await kpiEngine.calculateMetric(
      name,
      organizationId,
      {},
    );
    snapshotMetrics[name] = result.value as number;
  }

  // APPROVED recipient scope: SUPER_ADMIN only — active, non-deleted.
  const recipients = await prisma.user.findMany({
    where: {
      organizationId,
      role: 'SUPER_ADMIN',
      isActive: true,
      deletedAt: null,
    },
    select: {
      id: true,
      email: true,
      firstName: true,
    },
  });

  for (const recipient of recipients) {
    await emailQueue.add('WEEKLY_ANALYTICS_DIGEST', {
      organizationId,
      userId: recipient.id,
      to: recipient.email,
      subject: 'Your TeamSynch AI weekly summary',
      template: 'WEEKLY_ANALYTICS_DIGEST',
      context: {
        recipientFirstName: recipient.firstName,
        windowStart: windowFilters.startDate,
        windowEnd: windowFilters.endDate,
        windowedMetrics,
        snapshotMetrics,
      },
    });
  }

  logger.info('Weekly analytics digest enqueued', {
    jobId: job.id,
    organizationId,
    recipients: recipients.length,
  });

  return { success: true, recipients: recipients.length };
};
