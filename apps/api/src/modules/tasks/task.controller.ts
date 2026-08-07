import { Request, Response } from 'express';

import { TaskPriority, TaskStatus } from '@prisma/client';

import { TaskService } from './task.service';

import { getValidatedRequest } from '../../core/middlewares/validateRequest';

import { ListTasksQueryRequest } from './task.validator';

export class TaskController {
  constructor(private readonly service = new TaskService()) {}

  getTasks = async (req: Request, res: Response) => {
    /*
     * FEATURE (ledger #6): read through the validated query contract
     * (listTasksQuerySchema now guards this route) instead of coercing
     * raw req.query — same keys, same defaults (page 1, limit 50),
     * bounded at 500, enums/sortBy whitelisted. Field mapping is
     * byte-identical to the old coercion for every legitimate request;
     * isArchived keeps its 'true'/'false' string contract — undefined
     * flows to the repository's `?? false` default exactly as before.
     */
    const organizationId = req.user!.organizationId;

    const { query } = getValidatedRequest<ListTasksQueryRequest>(req);

    const result = await this.service.getTasks(organizationId, {
      page: query.page,
      limit: query.limit,
      search: query.search,
      projectId: query.projectId,
      assigneeId: query.assigneeId,
      status: query.status,
      priority: query.priority,
      isArchived:
        query.isArchived === undefined
          ? undefined
          : query.isArchived === 'true',
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
    });

    return res.status(200).json(result);
  };

  getTaskById = async (req: Request, res: Response) => {
    const id = String(req.params.id);
    const task = await this.service.getTaskById(
      req.user!.organizationId,
      id
    );

    return res.status(200).json(task);
  };

  createTask = async (req: Request, res: Response) => {
    const task = await this.service.createTask(
      req.user!.organizationId,
      req.user!.id,
      req.body
    );

    return res.status(201).json(task);
  };

  /*
   * BUG FIX (#99, 2026-08-06 — audit attribution fabricated by omission):
   * every mutating handler must pass req.user!.id so the emitted domain
   * events name the REAL actor (project.controller has done this since
   * #84). Until now update/move/assign fell back to the task's
   * reporterId, archive/restore carried nobody, and deletes recorded
   * 'system' — see the task.service #99 header for the full blast
   * radius (including a swallowed assignment notification).
   */
  updateTask = async (req: Request, res: Response) => {
    const id = String(req.params.id);
    const task = await this.service.updateTask(
      req.user!.organizationId,
      id,
      req.body,
      req.user!.id
    );

    return res.status(200).json(task);
  };

  moveTask = async (req: Request, res: Response) => {
    const id = String(req.params.id);
    const task = await this.service.moveTask(
      req.user!.organizationId,
      id,
      req.body,
      req.user!.id
    );

    return res.status(200).json(task);
  };

  assignTask = async (req: Request, res: Response) => {
    const id = String(req.params.id);
    const task = await this.service.assignTask(
      req.user!.organizationId,
      id,
      req.body.assigneeId ?? null,
      req.user!.id
    );

    return res.status(200).json(task);
  };

  archiveTask = async (req: Request, res: Response) => {
    const id = String(req.params.id);
    const task = await this.service.archiveTask(
      req.user!.organizationId,
      id,
      req.user!.id
    );

    return res.status(200).json(task);
  };

  restoreTask = async (req: Request, res: Response) => {
    const id = String(req.params.id);
    const task = await this.service.restoreTask(
      req.user!.organizationId,
      id,
      req.user!.id
    );

    return res.status(200).json(task);
  };

  deleteTask = async (req: Request, res: Response) => {
    const id = String(req.params.id);
    await this.service.deleteTask(
      req.user!.organizationId,
      id,
      req.user!.id
    );

    return res.status(200).json({
      message: 'Task deleted successfully',
    });
  };
}