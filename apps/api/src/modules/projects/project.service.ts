import { ProjectRepository } from './project.repository';

import {
  CreateProjectDto,
  UpdateProjectDto,
  ProjectQueryDto,
} from './project.dto';

import { AppError } from '../../core/errors/AppError';
import { eventBus } from '../../core/events/EventBus';

import { ProjectStatus } from '@prisma/client';

export class ProjectService {
  private repository: ProjectRepository;

  constructor() {
    this.repository = new ProjectRepository();
  }

  async getProjects(
    organizationId: string,
    query: ProjectQueryDto
  ) {
    return this.repository.findMany(
      organizationId,
      query
    );
  }

  async getProjectById(
    organizationId: string,
    projectId: string
  ) {
    const project =
      await this.repository.findById(
        organizationId,
        projectId
      );

    if (!project) {
      throw new AppError(
        'Project not found',
        404
      );
    }

    return project;
  }

  /*
   * BUG FIX (#84, 2026-08-05 — project lifecycle invisible in the audit
   * trail): the
   * EventBus catalog DECLARED `ProjectCreated` / `ProjectUpdated`, and the
   * audit schema, GET /audit validator and Audit Trail UI all present
   * PROJECT as an auditable EntityType — but this service emitted nothing,
   * so creating, renaming, archiving, restoring, or deleting an entire
   * project (with all its tasks) left ZERO compliance-trail rows and the
   * SUPER_ADMIN's entityType=PROJECT filter was guaranteed-empty forever.
   * Same defect class as #83 (declared audit coverage with no producer).
   * Every mutating method now emits its domain event AFTER persistence
   * (exactly the task.service pattern), and the AuditSubscriber maps them
   * to ActivityLog rows. `ProjectDeleted` was added to the catalog for
   * parity with TaskSoftDeleted / ClientDeleted.
   */
  async createProject(
    organizationId: string,
    ownerId: string,
    data: CreateProjectDto
  ) {
    const existing =
      await this.repository.findByKey(
        organizationId,
        data.key.toUpperCase()
      );

    if (existing) {
      throw new AppError(
        'Project key already exists',
        400
      );
    }

    const project = await this.repository.create(
      organizationId,
      {
        ...data,
        ownerId,
      }
    );

    // Emit strongly typed domain event (audited via AuditSubscriber)
    eventBus.emitEvent('ProjectCreated', {
      organizationId,
      projectId: project.id,
      actorId: ownerId,
      status: project.status,
    });

    return project;
  }

  async updateProject(
    organizationId: string,
    projectId: string,
    data: UpdateProjectDto,
    actorId: string
  ) {
    const project =
      await this.repository.update(
        organizationId,
        projectId,
        data
      );

    if (!project) {
      throw new AppError(
        'Project not found',
        404
      );
    }

    // Emit strongly typed domain event (audited via AuditSubscriber)
    eventBus.emitEvent('ProjectUpdated', {
      organizationId,
      projectId,
      actorId,
      // Subscriber records changed-field NAMES only, never values.
      changes: data,
    });

    return project;
  }

  async archiveProject(
    organizationId: string,
    projectId: string,
    actorId: string
  ) {
    const project =
      await this.repository.updateStatus(
        organizationId,
        projectId,
        ProjectStatus.ARCHIVED
      );

    if (!project) {
      throw new AppError(
        'Project not found',
        404
      );
    }

    // Status transitions are audited as UPDATEs carrying the enum value
    // (TaskStatusMoved precedent), so archive/restore stay identifiable.
    eventBus.emitEvent('ProjectUpdated', {
      organizationId,
      projectId,
      actorId,
      changes: { status: ProjectStatus.ARCHIVED },
    });

    return project;
  }

  async restoreProject(
    organizationId: string,
    projectId: string,
    actorId: string
  ) {
    const project =
      await this.repository.updateStatus(
        organizationId,
        projectId,
        ProjectStatus.PLANNING
      );

    if (!project) {
      throw new AppError(
        'Project not found',
        404
      );
    }

    eventBus.emitEvent('ProjectUpdated', {
      organizationId,
      projectId,
      actorId,
      changes: { status: ProjectStatus.PLANNING },
    });

    return project;
  }

  async deleteProject(
    organizationId: string,
    projectId: string,
    actorId: string
  ) {
    const project =
      await this.repository.softDelete(
        organizationId,
        projectId
      );

    if (!project) {
      throw new AppError(
        'Project not found',
        404
      );
    }

    // Emit strongly typed domain event (audited via AuditSubscriber)
    eventBus.emitEvent('ProjectDeleted', {
      organizationId,
      projectId,
      actorId,
    });

    return project;
  }
}
