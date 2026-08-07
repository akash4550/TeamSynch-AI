import { Worker } from 'bullmq';
import { getRedisClient } from '../../../core/redis/redis.client';
import { QUEUE_NAMES } from '../queues';
import {
  recordQueueJobCompleted,
  recordQueueJobFailed,
} from '../../../core/metrics/queueMetrics';

import { emailProcessor } from '../processors/email.processor';
import { notificationProcessor } from '../processors/notification.processor';
import { analyticsProcessor } from '../processors/analytics.processor';
import { aiProcessor } from '../processors/ai.processor';
import { auditExportProcessor } from '../processors/audit-export.processor';
import { calendarSyncProcessor } from '../processors/calendar-sync.processor';
import { cleanupProcessor } from '../processors/cleanup.processor';
import {
  weeklyAnalyticsDigestProcessor,
  weeklyAnalyticsFanoutProcessor,
} from '../processors/weekly-analytics.processor';
import {
  JOB_DOCUMENT_RAG_INGEST,
  ragIngestionProcessor,
} from '../processors/rag-ingestion.processor';

/*
 * BUG FIX (#48 — the maintenance queue had NO worker): startWorkers()
 * registered workers for only 4 of the 7 queues (EMAIL, NOTIFICATIONS,
 * ANALYTICS, AI). Everything enqueued to `maintenanceQueue` was accepted and
 * then stranded in `waiting` forever:
 *   - audit.service AUDIT_LOG_EXPORT: the compliance export returned
 *     202 { jobId }, but `auditExportProcessor` was never even IMPORTED
 *     anywhere — the job never ran, the `audit.export.completed` socket
 *     event (with the signed download URL) never fired, and the admin's
 *     AuditLogViewerPage sat pending until its 60s stall timeout. The
 *     compliance export feature was 100% non-functional end-to-end.
 *   - calendar.service CALENDAR_TWO_WAY_SYNC (x2 callers): the 202'd sync
 *     silently never executed; `calendar.sync.completed` never emitted.
 *   - scheduler daily-cleanup cron: enqueued nightly, never processed.
 * The fix registers a maintenance worker that dispatches by job name to the
 * two existing (previously orphaned) processors. The `daily-cleanup`
 * repeat-job had no processor implementation anywhere in the repo, so it
 * routed to a logged no-op — preserving its behavior while making the gap
 * visible in logs instead of crash-looping the worker every midnight.
 * (UPDATE — ledger #2, 2026-08-05: retention policy is now APPROVED —
 * operational residue only, 90-day windows — so 'daily-cleanup' routes to
 * cleanupProcessor below; the no-op default remains for unknown names.)
 */
// Exported for direct dispatch testing (BUG FIX #48 harness + future jest suites).
export const maintenanceProcessor = async (job: { name: string } & any) => {
  switch (job.name) {
    case 'AUDIT_LOG_EXPORT':
      return auditExportProcessor(job);
    case 'CALENDAR_TWO_WAY_SYNC':
      return calendarSyncProcessor(job);
    case 'daily-cleanup':
      // FEATURE (ledger #2): real retention purge — residue-only scope,
      // 90-day defaults; see processors/cleanup.processor.ts.
      return cleanupProcessor(job);
    default:
      // See BUG FIX (#48) above: no implementation exists for this job name
      // (e.g. the scheduler's `daily-cleanup`). Resolve instead of throwing
      // so the repeat job doesn't retry-crash nightly; the warn makes the
      // missing implementation discoverable.
      console.warn(
        `[MaintenanceWorker] No processor implemented for job '${job.name}' — skipping.`,
      );
      return { skipped: true };
  }
};

/*
 * BUG FIX (#58 — the weekly analytics cron job could NEVER succeed): the
 * scheduler (jobs/scheduler) enqueues a recurring 'weekly-analytics-refresh'
 * onto the ANALYTICS queue every Sunday 01:00 with a system payload
 * `{ systemTask: true, reportType: 'WEEKLY_SUMMARY' }` — NO organizationId.
 * But the worker ran the PER-TENANT `analyticsProcessor` directly, whose
 * first statement throws 'Tenant context missing for Analytics Job' on a
 * falsy organizationId. With queue defaults attempts:3 / exponential
 * backoff / removeOnFail:false, every single weekly fire produced 3
 * guaranteed failures, permanently retained — the JobsDashboard failed
 * list for analyticsQueue would fill with phantom failures (52 repeat
 * instances/year), masking real ones and inflating queue-failure metrics.
 * No implementation exists anywhere for a global (org-less) weekly summary
 * — mirroring the #48 handling of the maintenance scheduler's
 * 'daily-cleanup', the job resolves as a logged no-op so the gap is
 * visible without retry-crashing forever. ANY payload that carries tenant
 * context (e.g. a future per-tenant aggregation enqueue) still routes to
 * analyticsProcessor unchanged, including its missing-tenant throw
 * contract.
 * Exported for direct dispatch testing (same convention as #48).
 * (UPDATE — ledger #5, 2026-08-05: the weekly design is APPROVED — per-org
 * fan-out + SUPER_ADMIN digest email — so 'weekly-analytics-refresh' and
 * the per-org jobs it fans out to now route to real processors in
 * processors/weekly-analytics.processor.ts. The logged no-op remains the
 * honest state for any OTHER unknown system job.)
 */
/*
 * FEATURE (ledger #9 — 2026-08-05): DOCUMENTS queue gets its first worker.
 * The only producer is DocumentService enqueuing DOCUMENT_RAG_INGEST after
 * every text-like upload/replace (RAG ingestion); any other name resolves
 * as a logged skip, same convention as the maintenance dispatcher (#48)
 * and analytics dispatcher (#58). Exported for direct dispatch testing.
 */
export const documentsDispatchProcessor = async (job: { name: string } & any) => {
  if (job.name === JOB_DOCUMENT_RAG_INGEST) {
    return ragIngestionProcessor(job);
  }
  console.warn(
    `[DocumentsWorker] No processor implemented for job '${job.name}' — skipping.`,
  );
  return { skipped: true };
};

export const analyticsDispatchProcessor = async (job: { name: string } & any) => {
  // FEATURE (ledger #5): the two names of the approved weekly design.
  // The system fan-out job is org-less BY DESIGN — route it by NAME, not
  // by payload shape, so the #58 system-skip below never swallows it.
  if (job.name === 'weekly-analytics-refresh') {
    return weeklyAnalyticsFanoutProcessor(job);
  }
  if (job.name === 'weekly-analytics-digest') {
    return weeklyAnalyticsDigestProcessor(job);
  }
  if (job.data?.systemTask && !job.data?.organizationId) {
    console.warn(
      `[AnalyticsWorker] No processor implemented for system job '${job.name}' (no tenant context) — skipping.`,
    );
    return { skipped: true };
  }
  return analyticsProcessor(job);
};

/*
 * BUG FIX (#77 — graceful shutdown stranded in-flight jobs on every
 * deploy): startWorkers() returned the workers to app.ts, which DISCARDED
 * them, and stopWorkers() was dead code — so the carefully ordered
 * SIGTERM sequence in server.ts closed HTTP, Socket.IO, Redis (quit
 * beneath blocking BRPOPLPUSH reads) and Prisma while up to 5 workers
 * were potentially mid-flight (audit export writing storage objects, AI
 * completion spending quota). Every Docker/K8s restart was a
 * deterministic corruption window (orphaned uploads, crashed processors,
 * stalled-job churn). The registry below lets server.ts drain the exact
 * started instances without changing the start call site.
 */
let activeWorkers: Worker[] = [];

export const startWorkers = () => {
  try {
    const connection = getRedisClient();

    const workerOptions = {
      connection,
      concurrency: parseInt(process.env.WORKER_CONCURRENCY || '5', 10),
    };

    console.log('Starting BullMQ background workers...');

    const emailWorker = new Worker(QUEUE_NAMES.EMAIL, emailProcessor, workerOptions);
    const notificationWorker = new Worker(QUEUE_NAMES.NOTIFICATIONS, notificationProcessor, workerOptions);
    // BUG FIX (#58): was `analyticsProcessor` directly — the scheduler's
    // weekly systemTask job (no organizationId) retry-crashed 3x weekly
    // against its tenant-context guard. Routed through the dispatcher.
    const analyticsWorker = new Worker(QUEUE_NAMES.ANALYTICS, analyticsDispatchProcessor, workerOptions);
    const aiWorker = new Worker(QUEUE_NAMES.AI, aiProcessor, workerOptions);
    // BUG FIX (#48): was missing — maintenanceQueue jobs were stranded forever.
    const maintenanceWorker = new Worker(QUEUE_NAMES.MAINTENANCE, maintenanceProcessor, workerOptions);
    // FEATURE (ledger #9): documentsQueue worker — RAG ingestion dispatch.
    const documentsWorker = new Worker(QUEUE_NAMES.DOCUMENTS, documentsDispatchProcessor, workerOptions);

    const workers = [emailWorker, notificationWorker, analyticsWorker, aiWorker, maintenanceWorker, documentsWorker];

    activeWorkers = workers; // BUG FIX (#77): registered for server.ts shutdown draining

    workers.forEach(worker => {
      worker.on('completed', job => {
        recordQueueJobCompleted(worker.name);
        console.log(`Job ${job.id} of type ${job.name} completed successfully.`);
      });

      worker.on('failed', (job, err) => {
        recordQueueJobFailed(worker.name);
        console.error(`Job ${job?.id} of type ${job?.name} failed with error: ${err.message}`);
      });

      worker.on('error', err => {
        console.warn(`[Worker:${worker.name}] Redis connection error: ${err.message}`);
      });
    });

    return workers;
  } catch (error: any) {
    console.warn('[Workers] Redis is offline. Background workers will connect automatically when Redis starts.', error.message);
    activeWorkers = []; // BUG FIX (#77): keep the registry truthful on failed start
    return [];
  }
};

/*
 * BUG FIX (#77): now actually invoked by server.ts during graceful
 * shutdown. Defaulting to the registry means the shutdown path drains the
 * exact workers startWorkers() created; worker.close() stops fetching new
 * jobs and waits for each worker's current job to finish (bounded overall
 * by the 15s force-exit safety net in server.ts). Idempotent: the second
 * no-arg call is a no-op.
 */
export const stopWorkers = async (workers: Worker[] = activeWorkers): Promise<void> => {
  console.log('Shutting down background workers gracefully...');
  await Promise.all(workers.map(worker => worker.close()));
  if (workers === activeWorkers) {
    activeWorkers = [];
  }
};
