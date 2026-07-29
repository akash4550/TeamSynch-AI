import { NotificationRepository } from './notification.repository';

export class NotificationService {
  private repository = new NotificationRepository();

  async getUserNotifications(organizationId: string, userId: string) {
    return this.repository.findByUserId(organizationId, userId);
  }

  async markNotificationAsRead(organizationId: string, userId: string, notificationId: string) {
    return this.repository.markAsRead(organizationId, userId, notificationId);
  }

  async markAllNotificationsAsRead(organizationId: string, userId: string) {
    return this.repository.markAllAsRead(organizationId, userId);
  }

  async createNotification(data: {
    organizationId: string;
    userId: string;
    title: string;
    message: string;
    type?: 'INFO' | 'WARNING' | 'ERROR' | 'SUCCESS';
    link?: string;
  }) {
    return this.repository.createNotification(data);
  }
}
