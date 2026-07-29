import { Request, Response } from 'express';
import { z } from 'zod';
import { getValidatedRequest } from '../../core/middlewares/validateRequest';
import { AuditService } from './audit.service';
import { exportAuditLogsSchema, getAuditLogsSchema } from './audit.validator';

const auditService = new AuditService();

type GetAuditLogsRequest = z.infer<typeof getAuditLogsSchema>;
type ExportAuditLogsRequest = z.infer<typeof exportAuditLogsSchema>;

export class AuditController {
  async getAuditLogs(req: Request, res: Response) {
    const { query } = getValidatedRequest<GetAuditLogsRequest>(req);
    const result = await auditService.getAuditLogs(req.user!.organizationId, query);
    res.json({ data: result });
  }

  async triggerComplianceExport(req: Request, res: Response) {
    const { body } = getValidatedRequest<ExportAuditLogsRequest>(req);
    const result = await auditService.triggerComplianceExport(
      req.user!.organizationId,
      req.user!.id,
      body.format,
      body
    );
    res.status(202).json({ data: result });
  }
}
