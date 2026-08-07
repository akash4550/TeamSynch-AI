import { eventBus, EventPayload } from '../../core/events/EventBus';
import { NotificationService } from '../notifications/notification.service';
import { getIO, organizationRoom, userRoom } from './socket';

export class RealtimeService {
  private notificationService = new NotificationService();
  initializeListeners() {
    eventBus.onEvent('TaskCreated', this.handleTaskCreated);
    eventBus.onEvent('TaskUpdated', this.handleTaskUpdated);
    eventBus.onEvent('TaskStatusMoved', this.handleTaskStatusMoved);
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

  /*
   * BUG FIX (Kanban drags invisible to other users): the /tasks/:id/move
   * endpoint emits ONLY the `TaskStatusMoved` domain event, which no
   * subscriber listened to — a teammate's drag never produced any socket
   * traffic, so every other board/list/dashboard kept rendering the stale
   * column until a manual refresh. Bridge the event to the same
   * `task.updated` socket message the web clients already handle (it
   * invalidates the ['tasks'] queries), reusing the existing client-side
   * contract instead of requiring a new one.
   */
  private handleTaskStatusMoved = (payload: EventPayload) => {
    this.emitToOrganization(payload.organizationId, 'task.updated', payload);
  };

  private handleTaskAssigned = async (payload: EventPayload) => {
    this.emitToOrganization(payload.organizationId, 'task.assigned', payload);

    if (payload.assigneeId && payload.assigneeId !== payload.actorId) {
      /*
       * BUG FIX (notifications vanished on every reload): the assignment
       * alert was emitted only over the socket, while the Notification
       * ledger (table, GET /notifications, mark-read endpoints) sat unused —
       * nothing ever persisted a row, so the bell lost all history on
       * refresh and the GET endpoint always returned empty. Persist the
       * record first, then emit WITH the real database id (the web store's
       * `{ id: random, ...payload }` spread lets this id win), so hydration
       * and remote mark-read now resolve against real rows. A persistence
       * failure degrades to the old ephemeral emit — it must never break
       * the socket delivery itself.
       */
      try {
        const notification =
          await this.notificationService.createNotification({
            organizationId: payload.organizationId,
            userId: payload.assigneeId,
            title: 'New Task Assigned',
            message: `You were assigned to task: ${payload.taskTitle}`,
            type: 'INFO',
            /*
             * BUG FIX (notification deep-link 404s): the link pointed at
             * `/tasks/:id`, but the web app mounts no task detail route —
             * clicking the bell entry landed on the NotFound page. Land on
             * the tasks board instead, the same convention used for search
             * results that lack a detail page.
             */
            link: `/tasks`,
          });

        this.emitToUser(payload.assigneeId, 'notification.new', {
          id: notification.id,
          title: notification.title,
          message: notification.message,
          link: notification.link,
          createdAt: notification.createdAt,
        });
      } catch (error) {
        console.warn(
          '[RealtimeService] Notification persistence failed; emitting ephemeral notification:',
          error,
        );
        this.emitToUser(payload.assigneeId, 'notification.new', {
          title: 'New Task Assigned',
          message: `You were assigned to task: ${payload.taskTitle}`,
          // Same 404 fix as the persisted path above: no /tasks/:id route exists.
          link: `/tasks`,
          createdAt: new Date(),
        });
      }
    }
  };
}
