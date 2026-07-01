import { prisma } from '../../../config/prisma';
import { AppError } from '../../../core/errors/AppError';
import { eventBus } from '../../../core/events/EventBus';
import { RealtimeService } from '../../realtime/realtime.service';
import { MoveOpportunityDto } from './crm.validator';
import { PipelineStageRepository } from './pipeline.repository';

export class CRMPipelineService {
  private realtimeService = new RealtimeService();
  private repository = new PipelineStageRepository();

  /**
   * Retrieves the full Pipeline Board:
   * Returns stages ordered by position, nested active Opportunities, and column aggregates
   * (totalRevenue, weightedForecastValue).
   */
  async getPipelineBoard(organizationId: string) {
    const stages = await prisma.pipelineStage.findMany({
      where: { organizationId },
      orderBy: { position: 'asc' },
      include: {
        opportunities: {
          where: { organizationId, deletedAt: null },
          orderBy: { createdAt: 'desc' },
          include: {
            lead: {
              select: { id: true, title: true, status: true, source: true },
            },
          },
        },
      },
    });

    const board = stages.map((stage) => {
      const totalRevenue = stage.opportunities.reduce(
        (sum, opp) => sum + Number(opp.expectedRevenue || 0),
        0
      );
      const weightedForecastValue = (totalRevenue * (stage.probability || 0)) / 100;

      return {
        id: stage.id,
        name: stage.name,
        probability: stage.probability,
        position: Number(stage.position),
        metrics: {
          opportunityCount: stage.opportunities.length,
          totalRevenue,
          weightedForecastValue,
        },
        opportunities: stage.opportunities,
      };
    });

    return board;
  }

  /**
   * Atomically moves an Opportunity to a target stage inside a prisma.$transaction:
   * 1. Validates tenant ownership of Opportunity and Target Stage.
   * 2. Updates Opportunity stageId & stage probability.
   * 3. Creates a CRMActivity audit log entry.
   * 4. Emits OpportunityStageMoved domain event & Socket.IO real-time event.
   */
  async moveOpportunity(
    organizationId: string,
    opportunityId: string,
    dto: MoveOpportunityDto,
    actorId: string
  ) {
    return prisma.$transaction(async (tx) => {
      const opportunity = await tx.opportunity.findFirst({
        where: { id: opportunityId, organizationId, deletedAt: null },
        include: { lead: { select: { title: true } }, stage: { select: { name: true } } },
      });

      if (!opportunity) {
        throw new AppError('Opportunity not found or access denied', 404);
      }

      const targetStage = await tx.pipelineStage.findFirst({
        where: { id: dto.targetStageId, organizationId },
      });

      if (!targetStage) {
        throw new AppError('Target pipeline stage not found', 404);
      }

      const updatedOpportunity = await tx.opportunity.update({
        where: { id: opportunityId },
        data: {
          stageId: targetStage.id,
          probability: targetStage.probability,
        },
      });

      const activityDescription = `Moved deal "${opportunity.lead?.title || opportunityId}" from stage "${opportunity.stage?.name || 'Previous'}" to "${targetStage.name}"`;
      await tx.cRMActivity.create({
        data: {
          organizationId,
          createdById: actorId,
          opportunityId: opportunity.id,
          leadId: opportunity.leadId,
          type: 'STATUS_CHANGE',
          description: activityDescription,
        },
      });

      eventBus.emitEvent('OpportunityStageMoved', {
        organizationId,
        opportunityId: opportunity.id,
        previousStageId: opportunity.stageId,
        newStageId: targetStage.id,
        actorId,
      });

      this.realtimeService.emitToOrganization(organizationId, 'crm.opportunity.moved', {
        opportunityId: opportunity.id,
        targetStageId: targetStage.id,
        targetStageName: targetStage.name,
        updatedAt: new Date().toISOString(),
      });

      return updatedOpportunity;
    });
  }

  async createStage(organizationId: string, dto: { name: string; probability?: number; position: number }) {
    const stage = await this.repository.create({
      organizationId,
      name: dto.name,
      probability: dto.probability,
      position: dto.position,
    });

    eventBus.emitEvent('PipelineStageCreated', { organizationId, stageId: stage.id });
    return stage;
  }

  async getStages(organizationId: string) {
    return this.repository.findAll(organizationId);
  }

  async getStage(organizationId: string, id: string) {
    const stage = await this.repository.findById(organizationId, id);
    if (!stage) {
      throw new AppError('Pipeline stage not found', 404);
    }
    return stage;
  }

  async updateStage(organizationId: string, id: string, dto: any) {
    const stage = await this.repository.update(id, organizationId, dto);
    eventBus.emitEvent('PipelineStageUpdated', { organizationId, stageId: stage.id });
    return stage;
  }

  async deleteStage(organizationId: string, id: string) {
    await this.repository.delete(id, organizationId);
    eventBus.emitEvent('PipelineStageDeleted', { organizationId, stageId: id });
  }

  async reorderStages(organizationId: string, dto: any) {
    await this.repository.reorder(organizationId, { stages: dto.stages });
    eventBus.emitEvent('PipelineStagesReordered', { organizationId });
  }
}

export { CRMPipelineService as PipelineStageService };
