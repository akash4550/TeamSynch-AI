import { Request, Response } from 'express';
import { z } from 'zod';
import { getValidatedRequest } from '../../../core/middlewares/validateRequest';
import { CRMPipelineService } from './pipeline.service';
import {
  createPipelineStageSchema,
  moveOpportunitySchema,
} from './crm.validator';

const pipelineService = new CRMPipelineService();

type CreateStageRequest = z.infer<typeof createPipelineStageSchema>;
type MoveOpportunityRequest = z.infer<typeof moveOpportunitySchema>;

export class CRMPipelineController {
  async getPipelineBoard(req: Request, res: Response) {
    const board = await pipelineService.getPipelineBoard(req.user!.organizationId);
    res.json({ data: board });
  }

  async createStage(req: Request, res: Response) {
    const { body } = getValidatedRequest<CreateStageRequest>(req);
    const stage = await pipelineService.createStage(req.user!.organizationId, body);
    res.status(201).json({ data: stage });
  }

  async moveOpportunity(req: Request, res: Response) {
    const { body, params } = getValidatedRequest<MoveOpportunityRequest>(req);
    const updatedOpportunity = await pipelineService.moveOpportunity(
      req.user!.organizationId,
      params.id,
      body,
      req.user!.id
    );
    res.json({ data: updatedOpportunity });
  }
}
