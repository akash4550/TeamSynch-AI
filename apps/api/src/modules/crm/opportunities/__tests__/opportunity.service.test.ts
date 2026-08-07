import { eventBus } from '../../../../core/events/EventBus';
import { OpportunityRepository } from '../opportunity.repository';
import { OpportunityService } from '../opportunity.service';

jest.mock('../opportunity.repository');
jest.mock('../../../../core/events/EventBus', () => ({
  eventBus: {
    emitEvent: jest.fn(),
  },
}));

describe('OpportunityService', () => {
  let service: OpportunityService;
  let repositoryMock: jest.Mocked<OpportunityRepository>;

  beforeEach(() => {
    jest.clearAllMocks();

    service = new OpportunityService();
    repositoryMock = (service as any)
      .repository as jest.Mocked<OpportunityRepository>;

    repositoryMock.create = jest.fn();
    repositoryMock.findById = jest.fn();
    repositoryMock.findMany = jest.fn();
    repositoryMock.update = jest.fn();
    repositoryMock.softDelete = jest.fn();
  });

  describe('createOpportunity', () => {
    it('creates an opportunity, emits an event, and returns it', async () => {
      const mockOpportunity = {
        id: 'opportunity-1',
        expectedRevenue: 10000,
      };

      repositoryMock.create.mockResolvedValue(
        mockOpportunity as any,
      );

      const result = await service.createOpportunity(
        'org-1',
        {
          leadId: 'lead-1',
          stageId: 'stage-1',
          expectedRevenue: 10000,
        },
      );

      expect(repositoryMock.create).toHaveBeenCalledWith({
        organizationId: 'org-1',
        leadId: 'lead-1',
        stageId: 'stage-1',
        expectedRevenue: 10000,
        closeDate: undefined,
        probability: undefined,
      });

      expect(eventBus.emitEvent).toHaveBeenCalledWith(
        'OpportunityCreated',
        {
          organizationId: 'org-1',
          opportunityId: 'opportunity-1',
        },
      );

      expect(result).toEqual(mockOpportunity);
    });
  });

  describe('updateOpportunity', () => {
    it('updates the opportunity and converts closeDate', async () => {
      const closeDate = '2026-12-31T00:00:00.000Z';

      const updatedOpportunity = {
        id: 'opportunity-1',
        expectedRevenue: 20000,
      };

      // TOOLCHAIN REPIN (ledger #13 — 2026-08-05): updateOpportunity gained
      // a pre-fetch tenant check (Pipeline Board broadcast fix — 404 before
      // touching the update). The auto-mocked findById returned undefined,
      // so this test died at the 404 instead of reaching the update path.
      repositoryMock.findById = jest.fn().mockResolvedValue({
        id: 'opportunity-1',
        stageId: 'stage-1',
      });
      repositoryMock.update.mockResolvedValue(
        updatedOpportunity as any,
      );

      const result = await service.updateOpportunity(
        'org-1',
        'opportunity-1',
        {
          expectedRevenue: 20000,
          closeDate,
        },
      );

      expect(repositoryMock.update).toHaveBeenCalledWith(
        'opportunity-1',
        'org-1',
        {
          leadId: undefined,
          stageId: undefined,
          expectedRevenue: 20000,
          closeDate: new Date(closeDate),
          probability: undefined,
        },
      );

      expect(eventBus.emitEvent).toHaveBeenCalledWith(
        'OpportunityUpdated',
        {
          organizationId: 'org-1',
          opportunityId: 'opportunity-1',
        },
      );

      expect(result).toEqual(updatedOpportunity);
    });

    it('does not emit an event when the update fails', async () => {
      // TOOLCHAIN REPIN (ledger #13 — 2026-08-05): this test previously
      // passed for the WRONG reason — the un-stubbed findById returned
      // undefined and the pre-fetch 404 happened to carry the same
      // 'Opportunity not found' message, so the update-failure path was
      // never exercised. Stub the pre-fetch so the rejection below really
      // comes from repository.update.
      repositoryMock.findById = jest.fn().mockResolvedValue({
        id: 'opportunity-1',
        stageId: 'stage-1',
      });
      repositoryMock.update.mockRejectedValue(
        new Error('Opportunity not found'),
      );

      await expect(
        service.updateOpportunity(
          'org-1',
          'opportunity-1',
          {
            expectedRevenue: 20000,
          },
        ),
      ).rejects.toThrow('Opportunity not found');

      expect(eventBus.emitEvent).not.toHaveBeenCalled();
    });
  });

  /*
   * BUG FIX (#104, 2026-08-06) pins — updateOpportunity forwards the
   * authenticated actor plus stage-change context to repository.update
   * as a StageChangeActivityRecord ONLY for a real, actor-attributed
   * stage change (the PipelineBoard drag path previously wrote NO audit
   * row at all). The in-transaction creation itself is pinned in
   * opportunity-stage-audit.test.ts.
   */
  describe('updateOpportunity stage-change audit descriptor (BUG FIX #104)', () => {
    const previous = {
      id: 'opportunity-1',
      stageId: 'stage-1',
      leadId: 'lead-1',
      lead: { id: 'lead-1', title: 'Acme deal', score: 40, status: 'NEW' },
      stage: {
        id: 'stage-1',
        name: 'Qualification',
        probability: 25,
        position: 1,
      },
    };

    beforeEach(() => {
      repositoryMock.findById = jest.fn().mockResolvedValue(previous);
      repositoryMock.update = jest.fn().mockResolvedValue({
        ...previous,
        stageId: 'stage-2',
      });
    });

    it('forwards actor + stage context as a descriptor on a real stage move', async () => {
      await service.updateOpportunity(
        'org-1',
        'opportunity-1',
        { stageId: 'stage-2' },
        'user-9',
      );

      expect(repositoryMock.update).toHaveBeenCalledWith(
        'opportunity-1',
        'org-1',
        expect.objectContaining({ stageId: 'stage-2' }),
        {
          createdById: 'user-9',
          leadId: 'lead-1',
          leadTitle: 'Acme deal',
          previousStageName: 'Qualification',
        },
      );
    });

    it('passes NO descriptor for a no-op drop back onto the same stage', async () => {
      await service.updateOpportunity(
        'org-1',
        'opportunity-1',
        { stageId: 'stage-1' },
        'user-9',
      );

      // Exact pre-#104 3-arg call shape: nothing to audit.
      expect(repositoryMock.update).toHaveBeenCalledWith(
        'opportunity-1',
        'org-1',
        expect.objectContaining({ stageId: 'stage-1' }),
      );
      expect(repositoryMock.update).toHaveBeenCalledTimes(1);
    });

    it('passes NO descriptor for a stageId-free patch (revenue edit)', async () => {
      await service.updateOpportunity(
        'org-1',
        'opportunity-1',
        { expectedRevenue: 42000 },
        'user-9',
      );

      expect(repositoryMock.update).toHaveBeenCalledWith(
        'opportunity-1',
        'org-1',
        expect.objectContaining({ expectedRevenue: 42000 }),
      );
    });

    it('passes NO descriptor when the caller supplies no actor (fail-closed attribution)', async () => {
      await service.updateOpportunity(
        'org-1',
        'opportunity-1',
        { stageId: 'stage-2' },
      );

      expect(repositoryMock.update).toHaveBeenCalledWith(
        'opportunity-1',
        'org-1',
        expect.objectContaining({ stageId: 'stage-2' }),
      );
    });
  });

  describe('deleteOpportunity', () => {
    it('soft deletes the opportunity and emits an event', async () => {
      repositoryMock.softDelete.mockResolvedValue();

      await service.deleteOpportunity(
        'org-1',
        'opportunity-1',
      );

      expect(repositoryMock.softDelete).toHaveBeenCalledWith(
        'opportunity-1',
        'org-1',
        expect.any(Date),
      );

      expect(eventBus.emitEvent).toHaveBeenCalledWith(
        'OpportunityDeleted',
        {
          organizationId: 'org-1',
          opportunityId: 'opportunity-1',
        },
      );
    });

    it('does not emit an event when soft deletion fails', async () => {
      repositoryMock.softDelete.mockRejectedValue(
        new Error('Opportunity not found'),
      );

      await expect(
        service.deleteOpportunity(
          'org-1',
          'opportunity-1',
        ),
      ).rejects.toThrow('Opportunity not found');

      expect(eventBus.emitEvent).not.toHaveBeenCalled();
    });
  });
});