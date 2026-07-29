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

export const auditExportProcessor = async (job: Job<AuditExportJobData>) => {
  const data = validateTenantJobData(job.data);
  const { organizationId, userId, format, filters } = data;

  const repository = new AuditRepository();
  const storageProvider = StorageFactory.getProvider();
  const realtimeService = new RealtimeService();

  logger.info(`[AuditExportWorker] Generating ${format} compliance export for org ${organizationId}`);

  const logs = await repository.findAllForExport(organizationId, filters || {});

  let exportBuffer: Buffer;
  let mimeType: string;
  let extension: string;

  if (format === 'JSON') {
    const jsonString = JSON.stringify(logs, null, 2);
    exportBuffer = Buffer.from(jsonString, 'utf-8');
    mimeType = 'application/json';
    extension = 'json';
  } else {
    // Generate CSV
    const headers = 'ID,Timestamp,User,Email,Type,EntityType,EntityID,IPAddress,UserAgent\n';
    const rows = logs.map((log: any) => {
      const userEmail = log.user?.email || 'System';
      const userName = log.user ? `${log.user.firstName} ${log.user.lastName}` : 'System';
      return `"${log.id}","${log.createdAt.toISOString()}","${userName}","${userEmail}","${log.type}","${log.entityType}","${log.entityId}","${log.ipAddress || ''}","${(log.userAgent || '').replace(/"/g, '""')}"`;
    }).join('\n');

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

  // Emit Realtime event to tenant room
  realtimeService.emitToOrganization(organizationId, 'audit.export.completed', {
    jobId: job.id,
    userId,
    format,
    downloadUrl,
    totalRecords: logs.length,
    completedAt: new Date().toISOString(),
  });

  logger.info(`[AuditExportWorker] Export complete. Generated ${logs.length} records.`);

  return {
    success: true,
    totalRecords: logs.length,
    downloadUrl,
  };
};
