import { ActivityType, EntityType, Prisma } from '@prisma/client';

import { eventBus, EventPayload } from '../../core/events/EventBus';
import { logger } from '../../core/utils/logger';
import { AuditRepository } from './audit.repository';

/**
 * FEATURE (queued item #12 — audit-trail write coverage):
 * `AuditRepository.recordAuditEntry` existed with a full typed contract
 * but was called by NOTHING — the compliance trail only ever contained
 * user role changes (written inline in user.repository). This subscriber
 * mirrors the RealtimeService.initializeListeners() architecture: it maps
 * the domain events ALREADY emitted on the EventBus to audit rows in one
 * place, so business services stay untouched.
 *
 * Scope decisions (conservative taxonomy):
 *  - Only events with a matching EntityType (TASK/PROJECT/CLIENT/
 *    DOCUMENT/USER) are mapped. Contact/Lead/Opportunity/Pipeline events
 *    have NO EntityType value today and are therefore skipped — mapping
 *    them to a wrong entity type would fabricate compliance data.
 *  - stripe.service's mislabelled 'ProjectUpdated' (action
 *    'SubscriptionUpdated') is fired on billing webhook churn, not on any
 *    project mutation — logging it as a project update would be a lie.
 *    Since Bug #84 mapped the (now genuinely emitted) ProjectUpdated
 *    event, that impostor is excluded structurally: its payload carries
 *    NO projectId, so record()'s `!entityId` guard drops it.
 *  - Metadata carries identifiers and enum values ONLY (changed-field
 *    NAMES for updates, never free-text values), keeping user-authored
 *    content out of the audit trail while preserving identifiability.
 *  - Writes are fire-and-forget with logged failures: an audit hiccup must
 *    never break the business operation that emitted the event.
 */
export class AuditSubscriber {
  private repository = new AuditRepository();

  private record(
    type: ActivityType,
    entityType: EntityType,
    payload: EventPayload,
    entityId?: string,
    metadata?: Prisma.InputJsonObject,
    userId?: string,
  ): void {
    if (!payload.organizationId || !entityId) return;

    void this.repository
      .recordAuditEntry({
        organizationId: payload.organizationId,
        userId,
        type,
        entityType,
        entityId,
        metadata,
      })
      .catch((error) => {
        logger.warn('[AuditSubscriber] Failed to write audit entry', {
          eventEntityType: entityType,
          entityId,
          error: error instanceof Error ? error.message : String(error),
        });
      });
  }

  initializeListeners(): void {
    // --- Tasks ---
    eventBus.onEvent('TaskCreated', (p) =>
      this.record(ActivityType.CREATE, EntityType.TASK, p, p.taskId,
        { projectId: p.projectId, status: p.status }, p.actorId));
    eventBus.onEvent('TaskUpdated', (p) =>
      this.record(ActivityType.UPDATE, EntityType.TASK, p, p.taskId,
        { changedFields: p.changes ? Object.keys(p.changes) : [] }, p.actorId));
    eventBus.onEvent('TaskStatusMoved', (p) =>
      this.record(ActivityType.UPDATE, EntityType.TASK, p, p.taskId,
        { status: p.status }, p.actorId));
    eventBus.onEvent('TaskAssigned', (p) =>
      this.record(ActivityType.UPDATE, EntityType.TASK, p, p.taskId,
        { assigneeId: p.assigneeId }, p.actorId));
    eventBus.onEvent('TaskSoftDeleted', (p) =>
      this.record(ActivityType.DELETE, EntityType.TASK, p, p.taskId,
        undefined, typeof p.actorId === 'string' && p.actorId !== 'system' ? p.actorId : undefined));

    /*
     * --- Projects (Bug #84) ---
     * Events are emitted by project.service after persistence. Update
     * metadata records changed-field NAMES only; archive/restore surface
     * the status enum value (TaskStatusMoved precedent). The billing
     * impostor described in the header dies at record()'s entityId guard.
     */
    eventBus.onEvent('ProjectCreated', (p) =>
      this.record(ActivityType.CREATE, EntityType.PROJECT, p, p.projectId,
        { status: p.status }, p.actorId));
    eventBus.onEvent('ProjectUpdated', (p) =>
      this.record(ActivityType.UPDATE, EntityType.PROJECT, p, p.projectId,
        {
          changedFields: p.changes ? Object.keys(p.changes) : [],
          ...(p.changes?.status ? { status: p.changes.status } : {}),
        }, p.actorId));
    eventBus.onEvent('ProjectDeleted', (p) =>
      this.record(ActivityType.DELETE, EntityType.PROJECT, p, p.projectId,
        undefined, typeof p.actorId === 'string' ? p.actorId : undefined));

    // --- Documents ---
    eventBus.onEvent('DocumentUploaded', (p) =>
      this.record(ActivityType.CREATE, EntityType.DOCUMENT, p, p.documentId,
        { fileName: p.fileName }, p.uploadedById));

    // --- CRM clients (lead/contact/opportunity/pipeline events skipped:
    // no matching EntityType — see header note) ---
    eventBus.onEvent('ClientCreated', (p) =>
      this.record(ActivityType.CREATE, EntityType.CLIENT, p, p.clientId));
    eventBus.onEvent('ClientUpdated', (p) =>
      this.record(ActivityType.UPDATE, EntityType.CLIENT, p, p.clientId));
    eventBus.onEvent('ClientDeleted', (p) =>
      this.record(ActivityType.DELETE, EntityType.CLIENT, p, p.clientId));

    logger.info('Audit subscriber: EventBus listeners attached');
  }
}

export const auditSubscriber = new AuditSubscriber();
