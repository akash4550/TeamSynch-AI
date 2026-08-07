import {
  Opportunity,
  Prisma,
} from '@prisma/client';

import { prisma } from '../../../config/prisma';
import { AppError } from '../../../core/errors/AppError';
import { OpportunityQueryDto } from './opportunity.dto';

export interface CreateOpportunityRecord {
  organizationId: string;
  leadId: string;
  stageId: string;
  expectedRevenue?: number;
  closeDate?: Date;
  probability?: number;
}

export interface UpdateOpportunityRecord {
  leadId?: string;
  stageId?: string;
  expectedRevenue?: number;
  closeDate?: Date;
  probability?: number;
}

/*
 * BUG FIX (#104, 2026-08-06 — drag-and-drop stage moves left no audit
 * trail): the PipelineBoard drop fires PATCH /crm/opportunities/:id —
 * the ONLY stage-move path the web client uses (no useMoveOpportunity
 * hook exists) — and, unlike the dedicated /move endpoint, this path
 * never wrote a STATUS_CHANGE CRMActivity. The "Recent Activities" feed
 * on the CRM Dashboard and the activity timelines on detail pages
 * therefore silently omitted the most frequent deal-progress event, and
 * nobody could reconstruct who moved which deal when. The service now
 * hands update() this descriptor (only when the stage ACTUALLY changes
 * and an actor is known) and the activity row is created below, inside
 * the SAME transaction as the stage update — exactly /move semantics:
 * audit and move commit or roll back together.
 */
export interface StageChangeActivityRecord {
  createdById: string;
  leadId: string | null;
  leadTitle?: string;
  previousStageName?: string;
}

/*
 * BUG FIX (#104): findById's query has ALWAYS included the lead summary
 * and full stage row, but its declared return type was the bare
 * Opportunity — an unseen type-vs-runtime lie the compiler exposed the
 * moment updateOpportunity needed those relation fields to build the
 * audit descriptor. This payload type makes the declaration honest.
 */
const opportunityDetailArgs =
  Prisma.validator<Prisma.OpportunityDefaultArgs>()({
    include: {
      lead: {
        select: { id: true, title: true, score: true, status: true },
      },
      stage: true,
    },
  });

export type OpportunityDetail = Prisma.OpportunityGetPayload<
  typeof opportunityDetailArgs
>;

const assertValidLead = async (
  transaction: Prisma.TransactionClient,
  organizationId: string,
  leadId: string,
): Promise<void> => {
  const lead = await transaction.lead.findFirst({
    where: {
      id: leadId,
      organizationId,
      deletedAt: null,
    },
    select: {
      id: true,
    },
  });

  if (!lead) {
    throw new AppError('Invalid opportunity lead', 400);
  }
};

/*
 * BUG FIX (#90, 2026-08-05 — opportunity probability silently desynced
 * from its stage): the dedicated /move endpoint syncs
 * `opportunity.probability = targetStage.probability`, but this
 * repository's two other write paths did NOT:
 *   - create() without an explicit probability fell to the schema
 *     `@default(0)` — so OpportunitiesPage's `opp.probability ??
 *     stage.probability` rendered 0% (0 is not nullish) and the
 *     CRMDashboard average-probability widget counted it as 0, even when
 *     the very stage row fetched right below carried e.g. 75;
 *   - update() on a stageId-only PATCH — exactly what the live
 *     PipelineBoard drag fires — moved the deal but kept the ORIGIN
 *     stage's probability forever.
 * The stage assertion already runs here inside the write transaction, so
 * it now returns the probability and both write paths apply /move
 * semantics: an EXPLICIT probability in the same payload always wins,
 * otherwise the opportunity tracks its stage.
 */
const assertValidStage = async (
  transaction: Prisma.TransactionClient,
  organizationId: string,
  stageId: string,
): Promise<{ id: string; probability: number; name: string }> => {
  const stage = await transaction.pipelineStage.findFirst({
    where: {
      id: stageId,
      organizationId,
    },
    select: {
      id: true,
      probability: true,
      // BUG FIX (#104): the stage NAME is needed to compose the
      // /move-parity STATUS_CHANGE activity description inside the same
      // write transaction (no extra post-commit read, no race window).
      name: true,
    },
  });

  if (!stage) {
    throw new AppError('Invalid opportunity stage', 400);
  }

  return stage;
};

export class OpportunityRepository {
  async create(
    input: CreateOpportunityRecord,
  ): Promise<Opportunity> {
    return prisma.$transaction(async (transaction) => {
      await assertValidLead(
        transaction,
        input.organizationId,
        input.leadId,
      );

      // BUG FIX (#90): explicit probability wins; otherwise inherit the
      // stage's (was: schema @default(0) → "0%" displayed forever).
      const stage = await assertValidStage(
        transaction,
        input.organizationId,
        input.stageId,
      );

      return transaction.opportunity.create({
        data: {
          organizationId: input.organizationId,
          leadId: input.leadId,
          stageId: input.stageId,
          expectedRevenue: input.expectedRevenue,
          closeDate: input.closeDate,
          probability: input.probability ?? stage.probability,
        },
      });
    });
  }

  async findById(
    organizationId: string,
    id: string,
  ): Promise<OpportunityDetail | null> {
    return prisma.opportunity.findFirst({
      where: {
        id,
        organizationId,
        deletedAt: null,
      },
      include: opportunityDetailArgs.include,
    });
  }

  async findMany(
    organizationId: string,
    query: OpportunityQueryDto,
  ): Promise<{
    data: Opportunity[];
    total: number;
  }> {
    const {
      page = 1,
      limit = 10,
      stageId,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = query;

    const skip = (page - 1) * limit;

    const where: Prisma.OpportunityWhereInput = {
      organizationId,
      deletedAt: null,
      ...(stageId
        ? {
            stageId,
          }
        : {}),
      ...(search
        ? {
            lead: {
              title: {
                contains: search,
                mode: 'insensitive',
              },
            },
          }
        : {}),
    };

    const [data, total] = await Promise.all([
      prisma.opportunity.findMany({
        where,
        skip,
        take: limit,
        orderBy: {
          [sortBy]: sortOrder,
        },
        include: {
          lead: {
            select: {
              id: true,
              title: true,
              assignedTo: true,
            },
          },
          stage: true,
        },
      }),
      prisma.opportunity.count({
        where,
      }),
    ]);

    return {
      data,
      total,
    };
  }

  async update(
    id: string,
    organizationId: string,
    input: UpdateOpportunityRecord,
    // BUG FIX (#104): optional — callers without an authenticated actor
    // keep the pre-#104 3-arg shape and simply get no audit row (audit
    // attribution is never fabricated; see the 'system'-fallback removal
    // in BUG FIX #99).
    stageChangeActivity?: StageChangeActivityRecord,
  ): Promise<Opportunity> {
    return prisma.$transaction(async (transaction) => {
      const existing =
        await transaction.opportunity.findFirst({
          where: {
            id,
            organizationId,
            deletedAt: null,
          },
          select: {
            id: true,
          },
        });

      if (!existing) {
        throw new AppError(
          'Opportunity not found',
          404,
        );
      }

      if (input.leadId !== undefined) {
        await assertValidLead(
          transaction,
          organizationId,
          input.leadId,
        );
      }

      /*
       * BUG FIX (#90): when the PATCH carries a stageId (the Pipeline
       * Board drag fires exactly `{ stageId }`), mirror /move: sync the
       * probability to the TARGET stage rather than leaving the origin
       * stage's value stranded — UNLESS the same payload sets it
       * explicitly (user override always wins). StageId-free patches
       * (revenue edit, probability-only slider) never touch the stage
       * pairing.
       */
      let stage:
        | { id: string; probability: number; name: string }
        | undefined;
      if (input.stageId !== undefined) {
        stage = await assertValidStage(
          transaction,
          organizationId,
          input.stageId,
        );
      }

      const updated = await transaction.opportunity.update({
        where: {
          id,
          organizationId,
          deletedAt: null,
        },
        data: {
          leadId: input.leadId,
          stageId: input.stageId,
          expectedRevenue: input.expectedRevenue,
          closeDate: input.closeDate,
          probability:
            input.probability !== undefined
              ? input.probability
              : stage
                ? stage.probability
                : undefined, // undefined → Prisma leaves the column untouched
        },
      });

      /*
       * BUG FIX (#104): /move-parity audit row for board drags, created
       * AFTER the stage update but INSIDE its transaction so the two
       * commit or roll back together (a failed audit surfaces as the
       * honest #35 error banner instead of a half-applied move). The
       * description deliberately mirrors CRMPipelineService.moveOpportunity
       * verbatim so the activity feed reads identically no matter which
       * endpoint performed the move. `stage` is guaranteed non-null
       * whenever the service supplies the descriptor (it only does so
       * alongside a stageId), and the `&& stage` guard keeps that
       * invariant compiler-enforced.
       */
      if (stageChangeActivity && stage) {
        const description = `Moved deal "${
          stageChangeActivity.leadTitle || id
        }" from stage "${
          stageChangeActivity.previousStageName || 'Previous'
        }" to "${stage.name}"`;

        await transaction.cRMActivity.create({
          data: {
            organizationId,
            createdById: stageChangeActivity.createdById,
            opportunityId: id,
            leadId: stageChangeActivity.leadId,
            type: 'STATUS_CHANGE',
            description,
          },
        });
      }

      return updated;
    });
  }

  async softDelete(
    id: string,
    organizationId: string,
    deletedAt: Date,
  ): Promise<void> {
    const result = await prisma.opportunity.updateMany({
      where: {
        id,
        organizationId,
        deletedAt: null,
      },
      data: {
        deletedAt,
      },
    });

    if (result.count !== 1) {
      throw new AppError(
        'Opportunity not found',
        404,
      );
    }
  }
}