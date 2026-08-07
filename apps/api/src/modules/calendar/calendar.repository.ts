import { prisma } from '../../config/prisma';
import { BaseTenantRepository } from '../../core/database/BaseTenantRepository';
import { CalendarProvider } from '@prisma/client';

export interface UpsertCalendarAccountInput {
  organizationId: string;
  userId: string;
  provider: CalendarProvider;
  email: string;
  /** AES-256-GCM ciphertext JSON (encryptToken) — never plaintext. */
  accessToken: string;
  /** AES-256-GCM ciphertext JSON, or null when the provider issued none. */
  refreshToken: string | null;
  accessTokenExpiresAt: Date;
  scopes?: string;
}

/*
 * FEATURE (ledger #3, 2026-08-05 — real calendar account persistence):
 * the old saveCalendarAccount encrypted tokens and THREW THE CIPHERTEXT
 * AWAY, crammed an orgId-only CalendarEvent shell row, and returned
 * fabricated plaintext — and findCalendarAccount returned an arbitrary
 * CalendarEvent row as "the account". Both were fiction. Below is the
 * real store against the CalendarAccount model: one row per
 * (organizationId, userId, provider), upserted on reconnect so linking
 * twice rotates tokens instead of duplicating accounts.
 */
export class CalendarRepository extends BaseTenantRepository<any> {
  async findCalendarAccount(
    organizationId: string,
    userId: string,
    provider: CalendarProvider
  ) {
    return prisma.calendarAccount.findUnique({
      where: {
        organizationId_userId_provider: {
          organizationId,
          userId,
          provider,
        },
      },
    });
  }

  async listCalendarAccounts(organizationId: string, userId: string) {
    return prisma.calendarAccount.findMany({
      where: { organizationId, userId },
      select: {
        id: true,
        provider: true,
        email: true,
        scopes: true,
        accessTokenExpiresAt: true,
        lastSyncedAt: true,
        createdAt: true,
        // Token columns deliberately excluded from every read surface.
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async upsertCalendarAccount(input: UpsertCalendarAccountInput) {
    return prisma.calendarAccount.upsert({
      where: {
        organizationId_userId_provider: {
          organizationId: input.organizationId,
          userId: input.userId,
          provider: input.provider,
        },
      },
      update: {
        email: input.email,
        accessToken: input.accessToken,
        refreshToken: input.refreshToken,
        accessTokenExpiresAt: input.accessTokenExpiresAt,
        scopes: input.scopes,
      },
      create: {
        organizationId: input.organizationId,
        userId: input.userId,
        provider: input.provider,
        email: input.email,
        accessToken: input.accessToken,
        refreshToken: input.refreshToken,
        accessTokenExpiresAt: input.accessTokenExpiresAt,
        scopes: input.scopes,
      },
    });
  }

  async deleteCalendarAccount(
    organizationId: string,
    userId: string,
    provider: CalendarProvider
  ) {
    return prisma.calendarAccount.deleteMany({
      where: { organizationId, userId, provider },
    });
  }

  async getEventsAndDeadlines(organizationId: string) {
    /*
     * FEATURE (ledger #3): the fabricated orgId-only CalendarEvent shell
     * rows produced by the old simulated link flow are no longer surfaced
     * as "events" (they carry no title/date — they were debris, and
     * showing them as synced events was a lie). Real synced events land
     * here only when the sync boundary has a provider to pull from.
     */
    const [tasks, projects] = await Promise.all([
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

    return { events: [], tasks, projects };
  }
}
