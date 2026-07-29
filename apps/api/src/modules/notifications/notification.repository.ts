import { prisma } from '../../config/prisma';

export class NotificationRepository {
  async findByUserId(organizationId: string, userId: string, limit = 20) {
    return prisma.notification.findMany({
      where: {
        organizationId,
        userId,
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: limit,
    });
  }

  async markAsRead(organizationId: string, userId: string, notificationId: string) {
    return prisma.notification.updateMany({
      where: {
        id: notificationId,
        organizationId,
        userId,
      },
      data: {
        read: true,
      },
    });
  }

  async markAllAsRead(organizationId: string, userId: string) {
    return prisma.notification.updateMany({
      where: {
        organizationId,
        userId,
        read: false,
      },
      data: {
        read: true,
      },
    });
  }

  async createNotification(data: {
    organizationId: string;
    userId: string;
    title: string;
    message: string;
    type?: 'INFO' | 'WARNING' | 'ERROR' | 'SUCCESS';
    link?: string;
  }) {
    return prisma.notification.create({
      data: {
        organizationId: data.organizationId,
        userId: data.userId,
        title: data.title,
        message: data.message,
        type: data.type || 'INFO',
        link: data.link,
      },
    });
  }
}
