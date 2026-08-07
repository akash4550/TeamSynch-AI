import { Job } from 'bullmq';

import { BaseJobData } from '../services/job.service';
import { prisma } from '../../../config/prisma';
import { logger } from '../../../core/utils/logger';

import { InvitationStatus } from '@prisma/client';

/*
 * FEATURE (ledger #2, 2026-08-05 — daily retention cleanup): the
 * scheduler has enqueued 'daily-cleanup' every midnight since the
 * beginning, but until today the maintenance dispatcher resolved it as a
 * logged no-op (#48) while the job payload claimed to "clean up expired
 * refresh tokens and soft-deleted records" — a cron that promised
 * retention and delivered nothing.
 *
 * APPROVED RETENTION POLICY (explicit user decision, 2026-08-05):
 *   SCOPE   — OPERATIONAL RESIDUE ONLY: revoked/expired refresh tokens,
 *             stale invitations, already-read notifications. NO
 *             user-authored content, NO soft-deleted business rows
 *             (restore-ability preserved), NO audit/AI-usage history.
 *   WINDOW  — 90 days per class. Env overrides (positive int days,
 *             invalid values fall back to 90):
 *               RETENTION_REFRESH_TOKEN_DAYS
 *               RETENTION_INVITATION_DAYS
 *               RETENTION_NOTIFICATION_DAYS
 *   ROLLOUT — live immediately, verbose per-class logs (see logger.info
 *             below; the supervisor log line carries exact delete counts).
 *
 * Non-destructive first stage: invitations PENDING past their accept-by
 * date are flipped to EXPIRED before any deletion — their #83/#1-era
 * status was a lie ("pending" links that expired weeks ago), and the flip
 * also feeds stage 2: used/expired invitations get one full window of
 * provenance before the purge touches them.
 */

const DEFAULT_RETENTION_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

const retentionDays = (envKey: string): number => {
  const raw = Number(process.env[envKey]);
  return Number.isInteger(raw) && raw > 0 ? raw : DEFAULT_RETENTION_DAYS;
};

const cutoffDate = (days: number, now: Date): Date =>
  new Date(now.getTime() - days * DAY_MS);

export interface CleanupResult {
  invitationsMarkedExpired: number;
  invitationsPurged: number;
  refreshTokensPurged: number;
  notificationsPurged: number;
  retentionDays: {
    invitations: number;
    refreshTokens: number;
    notifications: number;
  };
  durationMs: number;
}

export const cleanupProcessor = async (
  job: Job<BaseJobData>
): Promise<{ success: true } & CleanupResult> => {
  const startedAt = Date.now();
  const now = new Date();

  /*
   * Stage 1 (non-destructive honesty flip): stale PENDING invitations are
   * EXPIRED. Note these freshly-flipped rows now qualify for stage 2's
   * non-PENDING predicate — but only when their expiry is ALSO older than
   * the retention window, so today-cycled rows stay put.
   */
  const markedExpired = await prisma.teamInvitation.updateMany({
    where: {
      status: InvitationStatus.PENDING,
      expiresAt: { lt: now },
    },
    data: { status: InvitationStatus.EXPIRED },
  });

  /*
   * Stage 2 (destructive — approved scope only):
   * Invitations: any terminal status past the window. PENDING rows are
   * structurally unreachable here (stage 1 expired the stale ones; fresh
   * pendings are retained by the cutoff).
   */
  const invitationWindow = retentionDays('RETENTION_INVITATION_DAYS');
  const invitationsPurged = await prisma.teamInvitation.deleteMany({
    where: {
      status: { not: InvitationStatus.PENDING },
      expiresAt: { lt: cutoffDate(invitationWindow, now) },
    },
  });

  // Refresh tokens: revoked long ago OR expired long ago — either state
  // is operationally dead; active/valid rows are never touched.
  const tokenWindow = retentionDays('RETENTION_REFRESH_TOKEN_DAYS');
  const refreshTokensPurged = await prisma.refreshToken.deleteMany({
    where: {
      OR: [
        { revokedAt: { not: null, lt: cutoffDate(tokenWindow, now) } },
        { expiresAt: { lt: cutoffDate(tokenWindow, now) } },
      ],
    },
  });

  // Notifications: ONLY already-read ones past the window. Unread rows
  // are user-visible state and are never purged.
  const notificationWindow = retentionDays('RETENTION_NOTIFICATION_DAYS');
  const notificationsPurged = await prisma.notification.deleteMany({
    where: {
      read: true,
      createdAt: { lt: cutoffDate(notificationWindow, now) },
    },
  });

  const result: CleanupResult = {
    invitationsMarkedExpired: markedExpired.count,
    invitationsPurged: invitationsPurged.count,
    refreshTokensPurged: refreshTokensPurged.count,
    notificationsPurged: notificationsPurged.count,
    retentionDays: {
      invitations: invitationWindow,
      refreshTokens: tokenWindow,
      notifications: notificationWindow,
    },
    durationMs: Date.now() - startedAt,
  };

  // Verbose-by-policy: every nightly run leaves an exact audit trail of
  // what it destroyed, in the same supervisor log ops already watches.
  logger.info('[MaintenanceWorker] daily-cleanup completed', {
    jobId: job.id,
    ...result,
  });

  return { success: true, ...result };
};
