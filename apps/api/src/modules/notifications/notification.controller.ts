import { Request, Response } from 'express';
import { NotificationService } from './notification.service';

const notificationService = new NotificationService();

export class NotificationController {
  async getNotifications(req: Request, res: Response) {
    const notifications = await notificationService.getUserNotifications(
      req.user!.organizationId,
      req.user!.id,
    );
    res.json({ data: notifications });
  }

  async markAsRead(req: Request, res: Response) {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    await notificationService.markNotificationAsRead(
      req.user!.organizationId,
      req.user!.id,
      id,
    );
    res.json({ success: true });
  }

  async markAllAsRead(req: Request, res: Response) {
    await notificationService.markAllNotificationsAsRead(
      req.user!.organizationId,
      req.user!.id,
    );
    res.json({ success: true });
  }
}
