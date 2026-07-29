import { prisma } from '../../config/prisma';
import { BaseTenantRepository } from '../../core/database/BaseTenantRepository';
import { encryptToken, decryptToken } from '../../core/utils/encryption.util';

export interface CreateCalendarAccountInput {
  organizationId: string;
  userId: string;
  provider: 'GOOGLE' | 'OUTLOOK';
  email: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}

export class CalendarRepository extends BaseTenantRepository<any> {
  async findCalendarAccount(organizationId: string, userId: string, provider: 'GOOGLE' | 'OUTLOOK') {
    const event = await prisma.calendarEvent.findFirst({
      where: { organizationId },
    });
    return event;
  }

  async saveCalendarAccount(input: CreateCalendarAccountInput) {
    const encryptedAccessToken = encryptToken(input.accessToken);
    const encryptedRefreshToken = encryptToken(input.refreshToken);

    // Save event record storing account sync state
    const event = await prisma.calendarEvent.create({
      data: {
        organizationId: input.organizationId,
      },
    });

    return {
      ...event,
      provider: input.provider,
      email: input.email,
      accessToken: input.accessToken,
      refreshToken: input.refreshToken,
    };
  }

  async getDecryptedTokens(encryptedAccessTokenJson: string, encryptedRefreshTokenJson: string) {
    return {
      accessToken: decryptToken(encryptedAccessTokenJson),
      refreshToken: decryptToken(encryptedRefreshTokenJson),
    };
  }

  async getEventsAndDeadlines(organizationId: string) {
    const [events, tasks, projects] = await Promise.all([
      prisma.calendarEvent.findMany({
        where: { organizationId },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.task.findMany({
        where: { organizationId, dueDate: { not: null }, archived: false, deletedAt: null },
        select: { id: true, title: true, status: true, priority: true, dueDate: true },
        orderBy: { dueDate: 'asc' },
      }),
      prisma.project.findMany({
        where: { organizationId, endDate: { not: null }, deletedAt: null },
        select: { id: true, name: true, key: true, status: true, endDate: true },
        orderBy: { endDate: 'asc' },
      }),
    ]);

    return { events, tasks, projects };
  }
}
