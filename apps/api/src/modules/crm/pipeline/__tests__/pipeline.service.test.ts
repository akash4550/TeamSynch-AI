import { eventBus } from '../../../../core/events/EventBus';
import { PipelineStageRepository } from '../pipeline.repository';
import { PipelineStageService } from '../pipeline.service';

jest.mock('../pipeline.repository');

jest.mock('../../../../core/events/EventBus', () => ({
  eventBus: {
    emitEvent: jest.fn(),
  },
}));

describe('PipelineStageService', () => {
  let service: PipelineStageService;
  let repositoryMock: jest.Mocked<PipelineStageRepository>;

  beforeEach(() => {
    jest.clearAllMocks();

    service = new PipelineStageService();

    repositoryMock = (service as any)
      .repository as jest.Mocked<PipelineStageRepository>;

    repositoryMock.create = jest.fn();
    repositoryMock.findById = jest.fn();
    repositoryMock.findAll = jest.fn();
    repositoryMock.update = jest.fn();
    repositoryMock.delete = jest.fn();
    repositoryMock.reorder = jest.fn();
  });

  describe('createStage', () => {
    it('creates a stage, emits an event, and returns it', async () => {
      const mockStage = {
        id: 'stage-1',
        organizationId: 'org-1',
        name: 'Qualified',
        probability: 50,
        position: 1,
      };

      repositoryMock.create.mockResolvedValue(
        mockStage as any,
      );

      const result = await service.createStage(
        'org-1',
        {
          name: 'Qualified',
          probability: 50,
          position: 1,
        },
      );

      expect(repositoryMock.create).toHaveBeenCalledWith({
        organizationId: 'org-1',
        name: 'Qualified',
        probability: 50,
        position: 1,
      });

      expect(eventBus.emitEvent).toHaveBeenCalledWith(
        'PipelineStageCreated',
        {
          organizationId: 'org-1',
          stageId: 'stage-1',
        },
      );

      expect(result).toEqual(mockStage);
    });

    it('does not emit an event when creation fails', async () => {
      repositoryMock.create.mockRejectedValue(
        new Error('Stage creation failed'),
      );

      await expect(
        service.createStage('org-1', {
          name: 'Qualified',
          position: 1,
        }),
      ).rejects.toThrow('Stage creation failed');

      expect(eventBus.emitEvent).not.toHaveBeenCalled();
    });
  });

  describe('getStages', () => {
    it('returns stages belonging to the organization', async () => {
      const mockStages = [
        {
          id: 'stage-1',
          organizationId: 'org-1',
          name: 'Qualified',
          position: 1,
        },
      ];

      repositoryMock.findAll.mockResolvedValue(
        mockStages as any,
      );

      const result = await service.getStages('org-1');

      expect(repositoryMock.findAll).toHaveBeenCalledWith(
        'org-1',
      );

      expect(result).toEqual(mockStages);
    });
  });

  describe('getStage', () => {
    it('returns a tenant-scoped pipeline stage', async () => {
      const mockStage = {
        id: 'stage-1',
        organizationId: 'org-1',
        name: 'Qualified',
      };

      repositoryMock.findById.mockResolvedValue(
        mockStage as any,
      );

      const result = await service.getStage(
        'org-1',
        'stage-1',
      );

      expect(repositoryMock.findById).toHaveBeenCalledWith(
        'org-1',
        'stage-1',
      );

      expect(result).toEqual(mockStage);
    });

    it('throws when the stage is not found', async () => {
      repositoryMock.findById.mockResolvedValue(null);

      await expect(
        service.getStage('org-1', 'stage-1'),
      ).rejects.toThrow('Pipeline stage not found');

      expect(repositoryMock.findById).toHaveBeenCalledWith(
        'org-1',
        'stage-1',
      );
    });
  });

  describe('updateStage', () => {
    it('updates a stage, emits an event, and returns it', async () => {
      const updatedStage = {
        id: 'stage-1',
        organizationId: 'org-1',
        name: 'Negotiation',
        probability: 75,
        position: 2,
      };

      repositoryMock.update.mockResolvedValue(
        updatedStage as any,
      );

      const result = await service.updateStage(
        'org-1',
        'stage-1',
        {
          name: 'Negotiation',
          probability: 75,
          position: 2,
        },
      );

      expect(repositoryMock.update).toHaveBeenCalledWith(
        'stage-1',
        'org-1',
        {
          name: 'Negotiation',
          probability: 75,
          position: 2,
        },
      );

      expect(eventBus.emitEvent).toHaveBeenCalledWith(
        'PipelineStageUpdated',
        {
          organizationId: 'org-1',
          stageId: 'stage-1',
        },
      );

      expect(result).toEqual(updatedStage);
    });

    it('does not emit an event when the update fails', async () => {
      repositoryMock.update.mockRejectedValue(
        new Error('Pipeline stage not found'),
      );

      await expect(
        service.updateStage(
          'org-1',
          'stage-1',
          {
            name: 'Negotiation',
          },
        ),
      ).rejects.toThrow('Pipeline stage not found');

      expect(eventBus.emitEvent).not.toHaveBeenCalled();
    });
  });

  describe('deleteStage', () => {
    // TOOLCHAIN REPIN (ledger #13 — 2026-08-05): the FK-reference guard
    // (BUG FIX #62-ish era — countReferencingOpportunities + honest 409s
    // + P2003 TOCTOU net) shipped after this suite last ran, and jest's
    // auto-mock returned `undefined` for the new method, exploding the
    // service at `referencing.live`. The guard scenarios are now stubbed
    // AND pinned below so the guard can never silently rot away again.
    it('deletes a tenant-scoped stage and emits an event', async () => {
      repositoryMock.countReferencingOpportunities = jest
        .fn()
        .mockResolvedValue({ live: 0, total: 0 });
      repositoryMock.delete.mockResolvedValue();

      await service.deleteStage(
        'org-1',
        'stage-1',
      );

      expect(repositoryMock.delete).toHaveBeenCalledWith(
        'stage-1',
        'org-1',
      );

      expect(eventBus.emitEvent).toHaveBeenCalledWith(
        'PipelineStageDeleted',
        {
          organizationId: 'org-1',
          stageId: 'stage-1',
        },
      );
    });

    it('does not emit an event when deletion fails', async () => {
      repositoryMock.countReferencingOpportunities = jest
        .fn()
        .mockResolvedValue({ live: 0, total: 0 });
      repositoryMock.delete.mockRejectedValue(
        new Error('Pipeline stage not found'),
      );

      await expect(
        service.deleteStage('org-1', 'stage-1'),
      ).rejects.toThrow('Pipeline stage not found');

      expect(eventBus.emitEvent).not.toHaveBeenCalled();
    });

    it('refuses to delete a stage with LIVE opportunities (honest 409)', async () => {
      repositoryMock.countReferencingOpportunities = jest
        .fn()
        .mockResolvedValue({ live: 2, total: 2 });

      await expect(
        service.deleteStage('org-1', 'stage-1'),
      ).rejects.toThrow('2 active opportunities still sit');

      expect(repositoryMock.delete).not.toHaveBeenCalled();
      expect(eventBus.emitEvent).not.toHaveBeenCalled();
    });

    it('refuses to delete a stage referenced only by deleted opportunities (honest 409)', async () => {
      repositoryMock.countReferencingOpportunities = jest
        .fn()
        .mockResolvedValue({ live: 0, total: 1 });

      await expect(
        service.deleteStage('org-1', 'stage-1'),
      ).rejects.toThrow('previously deleted opportunity record still references');

      expect(repositoryMock.delete).not.toHaveBeenCalled();
      expect(eventBus.emitEvent).not.toHaveBeenCalled();
    });

    it('maps the P2003 TOCTOU race to a 409 instead of a raw 500', async () => {
      repositoryMock.countReferencingOpportunities = jest
        .fn()
        .mockResolvedValue({ live: 0, total: 0 });
      repositoryMock.delete.mockRejectedValue({ code: 'P2003' });

      await expect(
        service.deleteStage('org-1', 'stage-1'),
      ).rejects.toThrow('opportunities are linked to it');

      expect(eventBus.emitEvent).not.toHaveBeenCalled();
    });
  });

  describe('reorderStages', () => {
    it('reorders tenant-scoped stages and emits an event', async () => {
      repositoryMock.reorder.mockResolvedValue();

      const stages = [
        {
          id: 'stage-1',
          position: 2,
        },
        {
          id: 'stage-2',
          position: 1,
        },
      ];

      await service.reorderStages(
        'org-1',
        {
          stages,
        },
      );

      expect(repositoryMock.reorder).toHaveBeenCalledWith(
        'org-1',
        {
          stages,
        },
      );

      expect(eventBus.emitEvent).toHaveBeenCalledWith(
        'PipelineStagesReordered',
        {
          organizationId: 'org-1',
        },
      );
    });

    it('does not emit an event when reordering fails', async () => {
      repositoryMock.reorder.mockRejectedValue(
        new Error(
          'One or more pipeline stages were not found',
        ),
      );

      await expect(
        service.reorderStages(
          'org-1',
          {
            stages: [
              {
                id: 'stage-1',
                position: 1,
              },
            ],
          },
        ),
      ).rejects.toThrow(
        'One or more pipeline stages were not found',
      );

      expect(eventBus.emitEvent).not.toHaveBeenCalled();
    });
  });
});