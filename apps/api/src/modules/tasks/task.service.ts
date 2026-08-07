import { TaskStatus } from '@prisma/client';
import { AppError } from '../../core/errors/AppError';
import { eventBus } from '../../core/events/EventBus';
import { TaskRepository } from './task.repository';
import {
  CreateTaskDto,
  MoveTaskDto,
  TaskQueryDto,
  UpdateTaskDto,
} from './task.dto';

export class TaskService {
  constructor(private readonly repository = new TaskRepository()) {}

  async getTasks(organizationId: string, query: TaskQueryDto) {
    return this.repository.findMany(organizationId, query);
  }

  async getTaskById(organizationId: string, taskId: string) {
    const task = await this.repository.findById(organizationId, taskId);

    if (!task) {
      throw new AppError('Task not found', 404);
    }

    return task;
  }

  async createTask(
    organizationId: string,
    reporterId: string,
    data: CreateTaskDto
  ) {
    const task = await this.repository.create(
      organizationId,
      reporterId,
      data
    );

    // Emit strongly typed domain event
    eventBus.emitEvent('TaskCreated', {
      organizationId,
      taskId: task.id,
      actorId: reporterId,
      title: task.title,
      projectId: task.projectId,
      assigneeId: task.assigneeId,
      status: task.status,
    });

    return task;
  }

  async updateTask(
    organizationId: string,
    taskId: string,
    data: UpdateTaskDto,
    actorId?: string
  ) {
    const updateData: UpdateTaskDto = {
      ...data,
      ...(data.status === TaskStatus.DONE
        ? { completedAt: new Date() }
        : data.status
        ? { completedAt: null }
        : {}),
    };

    const task = await this.repository.update(
      organizationId,
      taskId,
      updateData
    );

    if (!task) {
      throw new AppError('Task not found', 404);
    }

    // Emit strongly typed domain event
    eventBus.emitEvent('TaskUpdated', {
      organizationId,
      taskId: task.id,
      actorId: actorId || task.reporterId,
      changes: updateData,
    });

    return task;
  }

  async moveTask(
    organizationId: string,
    taskId: string,
    data: MoveTaskDto,
    actorId?: string
  ) {
    const task = await this.repository.update(
      organizationId,
      taskId,
      {
        status: data.status,
        position: data.position,
        completedAt:
          data.status === TaskStatus.DONE ? new Date() : null,
      }
    );

    if (!task) {
      throw new AppError('Task not found', 404);
    }

    // Emit strongly typed domain event
    eventBus.emitEvent('TaskStatusMoved', {
      organizationId,
      taskId: task.id,
      actorId: actorId || task.reporterId,
      status: data.status,
      position: data.position,
    });

    return task;
  }

  async assignTask(
    organizationId: string,
    taskId: string,
    assigneeId: string | null,
    actorId?: string
  ) {
    const task = await this.repository.update(
      organizationId,
      taskId,
      {
        assigneeId,
      }
    );

    if (!task) {
      throw new AppError('Task not found', 404);
    }

    // Emit strongly typed domain event
    eventBus.emitEvent('TaskAssigned', {
      organizationId,
      taskId: task.id,
      taskTitle: task.title,
      assigneeId,
      actorId: actorId || task.reporterId,
    });

    return task;
  }

  /*
   * BUG FIX (#99, 2026-08-06 — task lifecycle half-invisible and
   * misattributed in the audit trail): this module's update/move/assign
   * events were emitted with `actorId || task.reporterId`, but the
   * controller never supplied an actorId, so EVERY update/move/assign
   * audit row named the task's REPORTER — a compliance-trail fabrication
   * whenever an admin/manager touched a colleague's task. The same
   * misattribution also reached RealtimeService's self-assign guard
   * (`assigneeId !== actorId`): a manager assigning the reporter's own
   * task back to them compared reporter-to-reporter and the assignment
   * notification was silently swallowed. Worse, archive/restore and the
   * controller's delete call carried no actor at all: archive/restore
   * emitted NOTHING (zero audit rows — the exact #84 defect class) and
   * deletes were attributed to 'system' (userId dropped). The controller
   * now passes req.user!.id on every mutation (project.controller's #84
   * pattern), and archive/restore emit TaskUpdated after persistence —
   * which also fixes their realtime gap: teammates' boards kept showing
   * archived cards (and hid restored ones) until a manual refresh, since
   * `task.updated` is the signal web clients already invalidate on.
   */
  async archiveTask(
    organizationId: string,
    taskId: string,
    actorId?: string
  ) {
    const task = await this.repository.update(
      organizationId,
      taskId,
      {
        archived: true,
      }
    );

    if (!task) {
      throw new AppError('Task not found', 404);
    }

    // Identifiable audit metadata: changed-field NAME only (#84 precedent:
    // archive/restore surface as UPDATEs carrying the lifecycle flag).
    eventBus.emitEvent('TaskUpdated', {
      organizationId,
      taskId: task.id,
      actorId: actorId || task.reporterId,
      changes: { archived: true },
    });

    return task;
  }

  async restoreTask(
    organizationId: string,
    taskId: string,
    actorId?: string
  ) {
    const task = await this.repository.update(
      organizationId,
      taskId,
      {
        archived: false,
      }
    );

    if (!task) {
      throw new AppError('Task not found', 404);
    }

    eventBus.emitEvent('TaskUpdated', {
      organizationId,
      taskId: task.id,
      actorId: actorId || task.reporterId,
      changes: { archived: false },
    });

    return task;
  }

  async deleteTask(
    organizationId: string,
    taskId: string,
    actorId?: string
  ) {
    const result = await this.repository.softDelete(
      organizationId,
      taskId
    );

    if (result.count === 0) {
      throw new AppError('Task not found', 404);
    }

    // Emit strongly typed domain event
    eventBus.emitEvent('TaskSoftDeleted', {
      organizationId,
      taskId,
      actorId: actorId || 'system',
    });

    return result;
  }
}
