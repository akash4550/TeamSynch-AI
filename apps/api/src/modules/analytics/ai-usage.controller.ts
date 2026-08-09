import { Request, Response } from 'express';

import { getValidatedRequest } from '../../core/middlewares/validateRequest';
import { AIUsageService } from './ai-usage.service';
import type { GetAIUsageRequest } from './ai-usage.dto';

export class AIUsageController {
  private service = new AIUsageService();

  /** GET /api/v1/analytics/ai-usage?days=30 — org-scoped AI usage summary. */
  async getAIUsage(req: Request, res: Response) {
    const { query } = getValidatedRequest<GetAIUsageRequest>(req);

    const summary = await this.service.getAIUsageSummary(
      req.user!.organizationId,
      query.days,
    );

    res.status(200).json({ data: summary });
  }
}
