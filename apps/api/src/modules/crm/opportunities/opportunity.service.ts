import { AppError } from '../../../core/errors/AppError';
import { eventBus } from '../../../core/events/EventBus';
import { RealtimeService } from '../../realtime/realtime.service';
import {
  CreateOpportunityDto,
  OpportunityQueryDto,
  UpdateOpportunityDto,
} from './opportunity.dto';
import {
  OpportunityRepository,
  StageChangeActivityRecord,
  UpdateOpportunityRecord,
} from './opportunity.repository';

export class OpportunityService {
  private repository: OpportunityRepository;
  private realtimeService = new RealtimeService();

  constructor() {
    this.repository = new OpportunityRepository();
  }

  async createOpportunity(
    organizationId: string,
    dto: CreateOpportunityDto,
  ) {
    const opportunity = await this.repository.create({
      organizationId,
      leadId: dto.leadId,
      stageId: dto.stageId,
      expectedRevenue: dto.expectedRevenue,
      closeDate: dto.closeDate
        ? new Date(dto.closeDate)
        : undefined,
      probability: dto.probability,
    });

    eventBus.emitEvent('OpportunityCreated', {
      organizationId,
      opportunityId: opportunity.id,
    });

    return opportunity;
  }

  async getOpportunities(
    organizationId: string,
    query: OpportunityQueryDto,
  ) {
    return this.repository.findMany(
      organizationId,
      query,
    );
  }

  async getOpportunity(
    organizationId: string,
    id: string,
  ) {
    const opportunity = await this.repository.findById(
      organizationId,
      id,
    );

    if (!opportunity) {
      throw new AppError(
        'Opportunity not found',
        404,
      );
    }

    return opportunity;
  }

  async updateOpportunity(
    organizationId: string,
    id: string,
    dto: UpdateOpportunityDto,
    // BUG FIX (#104, 2026-08-06): authenticated actor, forwarded by the
    // controller — required to attribute the stage-change STATUS_CHANGE
    // activity this path previously never wrote at all. Optional so
    // direct/non-HTTP service callers keep compiling; without an actor
    // NO activity row is written (attribution is never fabricated).
    actorId?: string,
  ) {
    /*
     * BUG FIX (pipeline move never broadcast on this path): the Pipeline
     * Board moves deals via this generic PATCH endpoint, which previously
     * updated the stage silently — only the dedicated /move endpoint emitted
     * `crm.opportunity.moved`, so other users' boards went stale. We now
     * emit the same room event when (and only when) the stage actually
     * changes; no-op drags dropped back onto the same column produce no
     * broadcast. The pre-fetch preserves the exact 404 contract the
     * repository transaction previously enforced. (BUG FIX #104 later
     * closed this path's remaining gap — the missing STATUS_CHANGE audit
     * row — below.)
     */
    const previous = await this.repository.findById(
      organizationId,
      id,
    );

    if (!previous) {
      throw new AppError(
        'Opportunity not found',
        404,
      );
    }

    const updateData: UpdateOpportunityRecord = {
      leadId: dto.leadId,
      stageId: dto.stageId,
      expectedRevenue: dto.expectedRevenue,
      closeDate:
        dto.closeDate === undefined
          ? undefined
          : new Date(dto.closeDate),
      probability: dto.probability,
    };

    /*
     * BUG FIX (#104): compose the /move-parity audit descriptor for a
     * REAL stage change only — the PipelineBoard drop PATCHes exactly
     * `{ stageId }`, and before this fix that move landed with zero
     * CRMActivity, so the CRM Dashboard's Recent Activities feed and
     * the detail-page timelines silently skipped drag-and-drop moves
     * (only the web-unused /move endpoint logged them). A no-op drop
     * back onto the same column (`dto.stageId === previous.stageId`)
     * logs nothing — mirroring the no-broadcast rule below. The names
     * for the description come free from the pre-fetch above
     * (`findById` includes lead.title and the full stage row); the
     * target stage's name is resolved inside the write transaction.
     * The 3-arg call shape is preserved whenever there is nothing to
     * audit so existing repository.call expectation sites keep their
     * exact arity.
     */
    const stageChangeActivity:
      | StageChangeActivityRecord
      | undefined =
      actorId &&
      dto.stageId !== undefined &&
      dto.stageId !== previous.stageId
        ? {
            createdById: actorId,
            leadId: previous.leadId ?? null,
            leadTitle: previous.lead?.title,
            previousStageName: previous.stage?.name,
          }
        : undefined;

    const updated = stageChangeActivity
      ? await this.repository.update(
          id,
          organizationId,
          updateData,
          stageChangeActivity,
        )
      : await this.repository.update(
          id,
          organizationId,
          updateData,
        );

    if (
      dto.stageId !== undefined &&
      updated.stageId !== previous.stageId
    ) {
      this.realtimeService.emitToOrganization(
        organizationId,
        'crm.opportunity.moved',
        {
          opportunityId: id,
          previousStageId: previous.stageId,
          targetStageId: updated.stageId,
          updatedAt:
            updated.updatedAt instanceof Date
              ? updated.updatedAt.toISOString()
              : new Date().toISOString(),
        },
      );
    }

    eventBus.emitEvent('OpportunityUpdated', {
      organizationId,
      opportunityId: id,
    });

    return updated;
  }

  async deleteOpportunity(
    organizationId: string,
    id: string,
  ): Promise<void> {
    await this.repository.softDelete(
      id,
      organizationId,
      new Date(),
    );

    eventBus.emitEvent('OpportunityDeleted', {
      organizationId,
      opportunityId: id,
    });
  }
}