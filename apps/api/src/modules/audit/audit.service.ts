import { AuditQueryOptions, AuditRepository } from './audit.repository';
import { maintenanceQueue } from '../jobs/queues';

export class AuditService {
  private repository = new AuditRepository();

  async getAuditLogs(organizationId: string, options: AuditQueryOptions) {
    return this.repository.findAuditLogsWithCursor(organizationId, options);
  }

  async triggerComplianceExport(
    organizationId: string,
    userId: string,
    format: 'CSV' | 'JSON',
    filters?: AuditQueryOptions
  ) {
    const job = await maintenanceQueue.add('AUDIT_LOG_EXPORT', {
      organizationId,
      userId,
      format,
      filters,
    });

    return {
      jobId: job.id,
      status: 'QUEUED',
      message: `Audit log compliance export (${format}) queued asynchronously.`,
      checkStatusUrl: `/api/v1/jobs/${job.id}`,
    };
  }
}
