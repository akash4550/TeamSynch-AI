import { Request, Response } from 'express';

import { getValidatedRequest } from '../../../core/middlewares/validateRequest';
import { OpportunityService } from './opportunity.service';
import type {
  CreateOpportunityRequest,
  DeleteOpportunityRequest,
  GetOpportunityRequest,
  ListOpportunitiesRequest,
  UpdateOpportunityRequest,
} from './opportunity.validator';

const opportunityService = new OpportunityService();

export class OpportunityController {
  async create(req: Request, res: Response) {
    const { body } =
      getValidatedRequest<CreateOpportunityRequest>(req);

    const opportunity =
      await opportunityService.createOpportunity(
        req.user!.organizationId,
        body,
      );

    res.status(201).json({
      data: opportunity,
    });
  }

  async getAll(req: Request, res: Response) {
    const { query } =
      getValidatedRequest<ListOpportunitiesRequest>(req);

    const result =
      await opportunityService.getOpportunities(
        req.user!.organizationId,
        query,
      );

    res.json(result);
  }

  async getOne(req: Request, res: Response) {
    const { params } =
      getValidatedRequest<GetOpportunityRequest>(req);

    const opportunity =
      await opportunityService.getOpportunity(
        req.user!.organizationId,
        params.id,
      );

    res.json({
      data: opportunity,
    });
  }

  async update(req: Request, res: Response) {
    const { body, params } =
      getValidatedRequest<UpdateOpportunityRequest>(req);

    const opportunity =
      await opportunityService.updateOpportunity(
        req.user!.organizationId,
        params.id,
        body,
        // BUG FIX (#104, 2026-08-06): forward the authenticated actor so
        // a drag-and-drop stage move can write its STATUS_CHANGE audit
        // row with honest attribution (was: no actor on this path at
        // all — the same gap class closed in BUG FIX #99 for tasks).
        req.user!.id,
      );

    res.json({
      data: opportunity,
    });
  }

  async delete(req: Request, res: Response) {
    const { params } =
      getValidatedRequest<DeleteOpportunityRequest>(req);

    await opportunityService.deleteOpportunity(
      req.user!.organizationId,
      params.id,
    );

    res.status(204).send();
  }
}