import { Job } from 'bullmq';
import { BaseJobData } from '../services/job.service';
import { validateTenantJobData } from '../queues';
import { AuditRepository, AuditQueryOptions } from '../../audit/audit.repository';
import { StorageFactory } from '../../../core/storage/StorageFactory';
import { RealtimeService } from '../../realtime/realtime.service';
import { logger } from '../../../core/utils/logger';

export interface AuditExportJobData extends BaseJobData {
  format: 'CSV' | 'JSON';
  filters?: AuditQueryOptions;
}

/*
 * BUG FIX (#70 — CSV corruption & spreadsheet formula injection):
 * audit-export CSV rows were interpolated raw into a quoted line. Only
 * `userAgent` was quote-escaped; `userName`/`userEmail` (user-controlled
 * via profile update) were not, so a `"` in a name corrupted every column
 * after it, and NO field was neutralized against formula injection: any
 * user- or request-controlled value beginning with = + - @ (optionally
 * padded with TAB/CR/space evasion) executes as a formula when an admin
 * opens the export in Excel/Sheets (reachable via userName, email,
 * ipAddress from spoofed X-Forwarded-For, and the userAgent header). A null
 * entityId also rendered as the literal text "null". Every cell now goes
 * through this serializer: nullish → '', embedded quotes doubled, and
 * dangerous-leading-character cells prefixed with a single quote (the
 * standard text-marker mitigation per OWASP CSV-injection guidance).
 */
function csvCell(value: unknown): string {
  let text = value === null || value === undefined ? '' : String(value);
  if (/^[\t\r ]*[=+\-@]/.test(text)) {
    text = "'" + text;
  }
  return `"${text.replace(/"/g, '""')}"`;
}

export const auditExportProcessor = async (job: Job<AuditExportJobData>) => {
  const data = validateTenantJobData(job.data);
  const { organizationId, userId, format, filters } = data;

  // Same tenant-context guard as the AI worker: the completion event is
  // delivered to the requesting user's room, so userId is mandatory here.
  if (!userId) {
    throw new Error('Tenant context (userId) missing in audit export job payload');
  }

  const repository = new AuditRepository();
  const storageProvider = StorageFactory.getProvider();
  const realtimeService = new RealtimeService();

  logger.info(`[AuditExportWorker] Generating ${format} compliance export for org ${organizationId}`);

  // BUG FIX (#71): findAllForExport now reports whether the 5000-row cap
  // cut the result; the flag flows into the completion payload so the UI
  // can never claim a truncated compliance export was complete.
  const { logs, truncated } = await repository.findAllForExport(organizationId, filters || {});

  let exportBuffer: Buffer;
  let mimeType: string;
  let extension: string;

  if (format === 'JSON') {
    const jsonString = JSON.stringify(logs, null, 2);
    exportBuffer = Buffer.from(jsonString, 'utf-8');
    mimeType = 'application/json';
    extension = 'json';
  } else {
    // Generate CSV — every field serialized through csvCell (see BUG FIX #70 above)
    const headers = 'ID,Timestamp,User,Email,Type,EntityType,EntityID,IPAddress,UserAgent\n';
    const rows = logs
      .map((log: any) => {
        const userEmail = log.user?.email || 'System';
        const userName = log.user
          ? `${log.user.firstName} ${log.user.lastName}`
          : 'System';
        return [
          csvCell(log.id),
          csvCell(log.createdAt.toISOString()),
          csvCell(userName),
          csvCell(userEmail),
          csvCell(log.type),
          csvCell(log.entityType),
          csvCell(log.entityId),
          csvCell(log.ipAddress),
          csvCell(log.userAgent),
        ].join(',');
      })
      .join('\n');

    exportBuffer = Buffer.from(headers + rows, 'utf-8');
    mimeType = 'text/csv';
    extension = 'csv';
  }

  const pathPrefix = `org_${organizationId}/audit_exports`;
  const originalname = `compliance_audit_export_${Date.now()}.${extension}`;

  const uploadResult = await storageProvider.uploadFile(
    {
      originalname,
      mimetype: mimeType,
      size: exportBuffer.length,
      buffer: exportBuffer,
    },
    pathPrefix
  );

  const downloadUrl = await storageProvider.getSignedDownloadUrl(uploadResult.key, 3600); // 1-hour pre-signed URL

  /*
   * BUG FIX (compliance export broadcast tenant-wide): the completion event
   * carries a pre-signed URL granting access to the FULL audit trail (user
   * IPs, agents, actions) — emitting it to the organization room handed that
   * link to every connected member, including non-admins. The export was
   * requested by a specific SYSTEM.ADMIN user, whose socket joins
   * `user:<userId>` at handshake; deliver it there instead.
   */
  realtimeService.emitToUser(userId, 'audit.export.completed', {
    jobId: job.id,
    userId,
    format,
    downloadUrl,
    totalRecords: logs.length,
    truncated, // BUG FIX (#71): honest truncation signal for the consumer
    completedAt: new Date().toISOString(),
  });

  logger.info(
    `[AuditExportWorker] Export complete. Generated ${logs.length} records${truncated ? ' (TRUNCATED at export cap)' : ''}.`
  );

  return {
    success: true,
    totalRecords: logs.length,
    truncated, // BUG FIX (#71)
    downloadUrl,
  };
};
