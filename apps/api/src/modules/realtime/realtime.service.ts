import { eventBus, EventPayload } from '../../core/events/EventBus';
import { getIO, organizationRoom, userRoom } from './socket';

export class RealtimeService {
  initializeListeners() {
    eventBus.onEvent('TaskCreated', this.handleTaskCreated);
    eventBus.onEvent('TaskUpdated', this.handleTaskUpdated);
    eventBus.onEvent('TaskAssigned', this.handleTaskAssigned);
    console.log('Realtime Service: EventBus listeners attached');
  }

  public emitToOrganization(organizationId: string, event: string, payload: any) {
    try {
      const io = getIO();
      const orgRoom = organizationRoom(organizationId);
      io.to(orgRoom).emit(event, payload);
    } catch (error) {
      console.warn(`[RealtimeService] Socket.io not initialized or room emit skipped:`, error);
    }
  }

  public emitToUser(userId: string, event: string, payload: any) {
    try {
      const io = getIO();
      const uRoom = userRoom(userId);
      io.to(uRoom).emit(event, payload);
    } catch (error) {
      console.warn(`[RealtimeService] Socket.io not initialized or user emit skipped:`, error);
    }
  }

  private handleTaskCreated = (payload: EventPayload) => {
    this.emitToOrganization(payload.organizationId, 'task.created', payload);
  };

  private handleTaskUpdated = (payload: EventPayload) => {
    this.emitToOrganization(payload.organizationId, 'task.updated', payload);
  };

  private handleTaskAssigned = (payload: EventPayload) => {
    this.emitToOrganization(payload.organizationId, 'task.assigned', payload);

    if (payload.assigneeId && payload.assigneeId !== payload.actorId) {
      this.emitToUser(payload.assigneeId, 'notification.new', {
        title: 'New Task Assigned',
        message: `You were assigned to task: ${payload.taskTitle}`,
        link: `/tasks/${payload.taskId}`,
        createdAt: new Date(),
      });
    }
  };
}
