import { EventEmitter } from 'events';

// Core Domain Events
export type DomainEvent =
  | 'TaskCreated'
  | 'TaskUpdated'
  | 'TaskStatusMoved'
  | 'TaskAssigned'
  | 'TaskSoftDeleted'
  | 'ProjectCreated'
  | 'ProjectUpdated'
  // Bug #84: parity with TaskSoftDeleted / ClientDeleted — project
  // soft-deletes are now emitted (and audited) instead of vanishing.
  | 'ProjectDeleted'
  | 'TeamMemberInvited'
  | 'UserJoinedTeam'
  | 'DocumentUploaded'
  | 'ClientCreated'
  | 'ClientUpdated'
  | 'ClientDeleted'
  | 'ContactCreated'
  | 'ContactUpdated'
  | 'ContactDeleted'
  | 'LeadCreated'
  | 'LeadUpdated'
  | 'LeadDeleted'
  | 'OpportunityCreated'
  | 'OpportunityUpdated'
  | 'OpportunityDeleted'
  | 'OpportunityStageMoved'
  | 'PipelineStageCreated'
  | 'PipelineStageUpdated'
  | 'PipelineStageDeleted'
  | 'PipelineStagesReordered'
  | 'CRMActivityLogged';

export interface EventPayload {
  organizationId: string;
  [key: string]: any;
}

class EventBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(50);
  }

  emitEvent(eventName: DomainEvent, payload: EventPayload) {
    this.emit(eventName, payload);
    return true;
  }

  onEvent(eventName: DomainEvent, listener: (payload: EventPayload) => void) {
    this.on(eventName, listener);
  }
}

export const eventBus = new EventBus();
