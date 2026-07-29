import { AuditService } from '../audit.service';
import { maintenanceQueue } from '../../jobs/queues';

jest.mock('../../jobs/queues', () => ({
  maintenanceQueue: {
    add: jest.fn(),
  },
}));

describe('AuditService', () => {
  let service: AuditService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AuditService();
  });

  describe('triggerComplianceExport', () => {
    it('enqueues an asynchronous AUDIT_LOG_EXPORT job to BullMQ', async () => {
      (maintenanceQueue.add as jest.Mock).mockResolvedValue({
        id: 'job-audit-123',
      });

      const response = await service.triggerComplianceExport('org-1', 'user-1', 'CSV');

      expect(maintenanceQueue.add).toHaveBeenCalledWith('AUDIT_LOG_EXPORT', {
        organizationId: 'org-1',
        userId: 'user-1',
        format: 'CSV',
        filters: undefined,
      });

      expect(response).toEqual({
        jobId: 'job-audit-123',
        status: 'QUEUED',
        message: 'Audit log compliance export (CSV) queued asynchronously.',
        checkStatusUrl: '/api/v1/jobs/job-audit-123',
      });
    });
  });
});
