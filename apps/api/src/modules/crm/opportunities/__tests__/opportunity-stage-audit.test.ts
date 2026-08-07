/*
 * BUG FIX (#104, 2026-08-06) repository-level pins — the STATUS_CHANGE
 * CRMActivity for a drag-and-drop stage move is created INSIDE the
 * write transaction (commit-or-rollback with the move itself), with
 * copy identical to CRMPipelineService.moveOpportunity. Uses the prisma
 * $transaction pass-through mock pattern established in
 * tasks/__tests__/task-events.test.ts (BUG FIX #99). Service-level
 * descriptor pins live in opportunity.service.test.ts (this file must
 * NOT jest.mock the repository — that suite does).
 */
import { prisma } from '../../../../config/prisma';
import { OpportunityRepository } from '../opportunity.repository';

jest.mock('../../../../config/prisma', () => ({
  prisma: {
    $transaction: jest.fn(),
  },
}));

const prismaMock = prisma as unknown as {
  $transaction: jest.Mock;
};

describe('OpportunityRepository.update stage-change activity (BUG FIX #104)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const buildTx = () => ({
    opportunity: {
      findFirst: jest.fn().mockResolvedValue({ id: 'opportunity-1' }),
      update: jest.fn().mockResolvedValue({
        id: 'opportunity-1',
        stageId: 'stage-2',
      }),
    },
    pipelineStage: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'stage-2',
        probability: 75,
        name: 'Negotiation',
      }),
    },
    cRMActivity: {
      create: jest.fn().mockResolvedValue({ id: 'activity-1' }),
    },
  });

  it('creates the STATUS_CHANGE activity INSIDE the transaction with /move-verbatim copy', async () => {
    const tx = buildTx();
    prismaMock.$transaction.mockImplementation(async (cb: any) => cb(tx));

    const repository = new OpportunityRepository();
    const result = await repository.update(
      'opportunity-1',
      'org-1',
      { stageId: 'stage-2' },
      {
        createdById: 'user-9',
        leadId: 'lead-1',
        leadTitle: 'Acme deal',
        previousStageName: 'Qualification',
      },
    );

    expect(tx.cRMActivity.create).toHaveBeenCalledTimes(1);
    expect(tx.cRMActivity.create).toHaveBeenCalledWith({
      data: {
        organizationId: 'org-1',
        createdById: 'user-9',
        opportunityId: 'opportunity-1',
        leadId: 'lead-1',
        type: 'STATUS_CHANGE',
        description:
          'Moved deal "Acme deal" from stage "Qualification" to "Negotiation"',
      },
    });

    // #90 regression guard: target-stage probability still synced.
    expect(tx.opportunity.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ probability: 75 }),
      }),
    );
    expect(result).toEqual({ id: 'opportunity-1', stageId: 'stage-2' });
  });

  it('falls back to the opportunity id and "Previous" when names are unknown', async () => {
    const tx = buildTx();
    prismaMock.$transaction.mockImplementation(async (cb: any) => cb(tx));

    const repository = new OpportunityRepository();
    await repository.update(
      'opportunity-1',
      'org-1',
      { stageId: 'stage-2' },
      { createdById: 'user-9', leadId: null },
    );

    expect(tx.cRMActivity.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        leadId: null,
        description:
          'Moved deal "opportunity-1" from stage "Previous" to "Negotiation"',
      }),
    });
  });

  it('writes NO activity when no descriptor is supplied (pre-#104 behavior for actorless callers)', async () => {
    const tx = buildTx();
    prismaMock.$transaction.mockImplementation(async (cb: any) => cb(tx));

    const repository = new OpportunityRepository();
    await repository.update('opportunity-1', 'org-1', {
      stageId: 'stage-2',
    });

    expect(tx.cRMActivity.create).not.toHaveBeenCalled();
  });

  it('honest 404 contract is untouched when the opportunity does not exist', async () => {
    const tx = buildTx();
    tx.opportunity.findFirst.mockResolvedValue(null);
    prismaMock.$transaction.mockImplementation(async (cb: any) => cb(tx));

    const repository = new OpportunityRepository();
    await expect(
      repository.update('opportunity-1', 'org-1', { stageId: 'stage-2' }),
    ).rejects.toThrow('Opportunity not found');

    expect(tx.cRMActivity.create).not.toHaveBeenCalled();
    expect(tx.opportunity.update).not.toHaveBeenCalled();
  });
});
