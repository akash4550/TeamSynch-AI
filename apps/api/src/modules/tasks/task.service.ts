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

  async archiveTask(organizationId: string, taskId: string) {
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

    return task;
  }

  async restoreTask(organizationId: string, taskId: string) {
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
