import {
  PipelineStage,
  Prisma,
} from '@prisma/client';

import { prisma } from '../../../config/prisma';
import { AppError } from '../../../core/errors/AppError';

export interface CreatePipelineStageRecord {
  organizationId: string;
  name: string;
  probability?: number;
  position: number;
}

export interface UpdatePipelineStageRecord {
  name?: string;
  probability?: number;
  position?: number;
}

export interface ReorderPipelineStageRecord {
  stages: Array<{
    id: string;
    position: number;
  }>;
}

export class PipelineStageRepository {
  async create(
    input: CreatePipelineStageRecord,
  ): Promise<PipelineStage> {
    return prisma.pipelineStage.create({
      data: {
        organizationId: input.organizationId,
        name: input.name,
        probability: input.probability,
        position: input.position,
      },
    });
  }

  async findById(
    organizationId: string,
    id: string,
  ): Promise<PipelineStage | null> {
    return prisma.pipelineStage.findFirst({
      where: {
        id,
        organizationId,
      },
    });
  }

  async findAll(
    organizationId: string,
  ): Promise<PipelineStage[]> {
    return prisma.pipelineStage.findMany({
      where: {
        organizationId,
      },
      orderBy: {
        position: 'asc',
      },
    });
  }

  async update(
    id: string,
    organizationId: string,
    data: UpdatePipelineStageRecord,
  ): Promise<PipelineStage> {
    return prisma.$transaction(async (transaction) => {
      const result =
        await transaction.pipelineStage.updateMany({
          where: {
            id,
            organizationId,
          },
          data,
        });

      if (result.count === 0) {
        throw new AppError(
          'Pipeline stage not found',
          404,
        );
      }

      return transaction.pipelineStage.findUniqueOrThrow({
        where: {
          id,
        },
      });
    });
  }

  /*
   * BUG FIX (#62): counts of opportunity ROWS referencing a stage —
   * `live` (deletedAt: null) and `total` (including soft-deleted).
   * Both are needed: the UI-facing guard must name live blockers, but the
   * RESTRICT foreign key fires for soft-deleted rows too, so `total`
   * distinguishes "move the opportunities" from "history must be retained".
   */
  async countReferencingOpportunities(
    stageId: string,
    organizationId: string,
  ): Promise<{ live: number; total: number }> {
    const [live, total] = await Promise.all([
      prisma.opportunity.count({
        where: { stageId, organizationId, deletedAt: null },
      }),
      prisma.opportunity.count({
        where: { stageId, organizationId },
      }),
    ]);
    return { live, total };
  }

  async delete(
    id: string,
    organizationId: string,
  ): Promise<void> {
    const result = await prisma.pipelineStage.deleteMany({
      where: {
        id,
        organizationId,
      },
    });

    if (result.count === 0) {
      throw new AppError(
        'Pipeline stage not found',
        404,
      );
    }
  }

  async reorder(
    organizationId: string,
    input: ReorderPipelineStageRecord,
  ): Promise<void> {
    await prisma.$transaction(async (transaction) => {
      const stageIds = input.stages.map(
        (stage) => stage.id,
      );

      const existingStages =
        await transaction.pipelineStage.findMany({
          where: {
            organizationId,
            id: {
              in: stageIds,
            },
          },
          select: {
            id: true,
          },
        });

      if (existingStages.length !== stageIds.length) {
        throw new AppError(
          'One or more pipeline stages were not found',
          404,
        );
      }

      await Promise.all(
        input.stages.map((stage) =>
          transaction.pipelineStage.updateMany({
            where: {
              id: stage.id,
              organizationId,
            },
            data: {
              position: stage.position,
            },
          }),
        ),
      );
    });
  }
}