/*
 * BUG FIX (#99, 2026-08-06) pins — task-mutation audit attribution and
 * archive/restore audit+realtime coverage:
 *
 *  - archiveTask/restoreTask must emit TaskUpdated AFTER persistence
 *    (they emitted NOTHING: zero audit rows, no `task.updated` socket
 *    broadcast, so archived cards lingered on teammates' boards).
 *  - update/move/assign/delete must forward the controller-supplied
 *    actorId instead of falling back to task.reporterId / 'system'
 *    (the fallback fabricated audit attribution and broke the
 *    self-assign notification guard when a manager assigned the
 *    reporter's own task back to them).
 */
import { TaskService } from '../task.service';
import { prisma } from '../../../config/prisma';
import { eventBus } from '../../../core/events/EventBus';
import { AppError } from '../../../core/errors/AppError';

jest.mock('../../../config/prisma', () => ({
  prisma: {
    $transaction: jest.fn(),
    task: { updateMany: jest.fn() },
  },
}));

jest.mock('../../../core/events/EventBus', () => ({
  eventBus: { emitEvent: jest.fn() },
}));

const prismaMock = prisma as unknown as {
  $transaction: jest.Mock;
  task: { updateMany: jest.Mock };
};

const emitMock = eventBus.emitEvent as jest.Mock;

const persistedTask = {
  id: 'task-1',
  reporterId: 'reporter-1',
  title: 'Write docs',
  assigneeId: 'user-2',
};

const buildTx = (overrides: { found?: boolean } = {}) => {
  const found = overrides.found ?? true;
  return {
    task: {
      findFirst: jest
        .fn()
        .mockResolvedValue(found ? { id: 'task-1', projectId: 'proj-1' } : null),
      update: jest.fn().mockResolvedValue(persistedTask),
    },
    project: {
      findFirst: jest.fn().mockResolvedValue({ id: 'proj-1' }),
    },
    user: {
      findFirst: jest.fn().mockResolvedValue({ id: 'user-2' }),
    },
  };
};

describe('Bug #99 — task mutation audit attribution & coverage', () => {
  let service: TaskService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new TaskService();
  });

  it('archiveTask emits TaskUpdated with the real actor and archived:true after persistence', async () => {
    const tx = buildTx();
    prismaMock.$transaction.mockImplementation(async (cb: any) => cb(tx));

    await service.archiveTask('org-1', 'task-1', 'actor-9');

    expect(emitMock).toHaveBeenCalledWith(
      'TaskUpdated',
      expect.objectContaining({
        organizationId: 'org-1',
        taskId: 'task-1',
        actorId: 'actor-9',
        changes: { archived: true },
      })
    );
  });

  it('restoreTask emits TaskUpdated with the real actor and archived:false after persistence', async () => {
    const tx = buildTx();
    prismaMock.$transaction.mockImplementation(async (cb: any) => cb(tx));

    await service.restoreTask('org-1', 'task-1', 'actor-9');

    expect(emitMock).toHaveBeenCalledWith(
      'TaskUpdated',
      expect.objectContaining({
        organizationId: 'org-1',
        taskId: 'task-1',
        actorId: 'actor-9',
        changes: { archived: false },
      })
    );
  });

  it('archiveTask on a missing task 404s and emits NOTHING (no phantom audit rows)', async () => {
    const tx = buildTx({ found: false });
    prismaMock.$transaction.mockImplementation(async (cb: any) => cb(tx));

    const err = await service
      .archiveTask('org-1', 'missing-task', 'actor-9')
      .catch((e) => e);

    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).statusCode).toBe(404);
    expect(emitMock).not.toHaveBeenCalled();
  });

  it('updateTask forwards the controller-supplied actorId instead of the reporter fallback', async () => {
    const tx = buildTx();
    prismaMock.$transaction.mockImplementation(async (cb: any) => cb(tx));

    await service.updateTask('org-1', 'task-1', { title: 'New title' }, 'actor-9');

    expect(emitMock).toHaveBeenCalledWith(
      'TaskUpdated',
      expect.objectContaining({ actorId: 'actor-9' })
    );
  });

  it('assignTask forwards the real actor so the self-assign notification guard sees the manager, not the reporter', async () => {
    const tx = buildTx();
    prismaMock.$transaction.mockImplementation(async (cb: any) => cb(tx));

    await service.assignTask('org-1', 'task-1', 'reporter-1', 'actor-9');

    expect(emitMock).toHaveBeenCalledWith(
      'TaskAssigned',
      expect.objectContaining({
        taskId: 'task-1',
        assigneeId: 'reporter-1',
        actorId: 'actor-9',
      })
    );
  });

  it('deleteTask forwards the real actor (never the unattributed \'system\' fallback)', async () => {
    prismaMock.task.updateMany.mockResolvedValue({ count: 1 });

    await service.deleteTask('org-1', 'task-1', 'actor-9');

    expect(emitMock).toHaveBeenCalledWith(
      'TaskSoftDeleted',
      expect.objectContaining({ taskId: 'task-1', actorId: 'actor-9' })
    );
  });

  it('defensive reporter fallback is retained for hypothetical event-driven callers without an actor', async () => {
    const tx = buildTx();
    prismaMock.$transaction.mockImplementation(async (cb: any) => cb(tx));

    await service.updateTask('org-1', 'task-1', { title: 'No actor' });

    expect(emitMock).toHaveBeenCalledWith(
      'TaskUpdated',
      expect.objectContaining({ actorId: 'reporter-1' })
    );
  });
});
