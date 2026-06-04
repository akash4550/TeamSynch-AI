import { Prisma, PrismaClient } from '@prisma/client';

import { prisma } from '../../config/prisma';

const authUserSelect = {
  id: true,
  organizationId: true,
  firstName: true,
  lastName: true,
  email: true,
  password: true,
  role: true,
  avatar: true,
  isActive: true,
  emailVerified: true,
  failedLoginAttempts: true,
  lockedUntil: true,
  lastLogin: true,
  createdAt: true,
  deletedAt: true,
  organization: {
    select: {
      id: true,
      name: true,
      slug: true,
      logo: true,
      isActive: true,
      deletedAt: true,
    },
  },
} satisfies Prisma.UserSelect;

export type AuthUserRecord = Prisma.UserGetPayload<{
  select: typeof authUserSelect;
}>;

interface RefreshTokenMetadata {
  device?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface CreateRefreshTokenInput extends RefreshTokenMetadata {
  tokenHash: string;
  userId: string;
  expiresAt: Date;
}

interface RotateRefreshTokenInput extends RefreshTokenMetadata {
  currentTokenHash: string;
  expectedUserId: string;
  expectedOrganizationId: string;
  replacementTokenHash: string;
  replacementExpiresAt: Date;
  now: Date;
}

export class AuthRepository {
  constructor(private readonly db: PrismaClient = prisma) {}

  findLoginUser(email: string, organizationId: string): Promise<AuthUserRecord | null> {
    return this.db.user.findUnique({
      where: {
        organizationId_email: {
          organizationId,
          email,
        },
      },
      select: authUserSelect,
    });
  }

  findAuthoritativeUser(userId: string): Promise<AuthUserRecord | null> {
    return this.db.user.findUnique({
      where: { id: userId },
      select: authUserSelect,
    });
  }

  async recordFailedLogin(userId: string): Promise<void> {
    const updatedUser = await this.db.user.update({
      where: { id: userId },
      data: {
        failedLoginAttempts: { increment: 1 },
      },
      select: {
        failedLoginAttempts: true,
      },
    });

    if (updatedUser.failedLoginAttempts >= 5) {
      await this.db.user.update({
        where: { id: userId },
        data: {
          lockedUntil: new Date(Date.now() + 15 * 60 * 1000),
        },
      });
    }
  }

  async recordSuccessfulLogin(userId: string): Promise<void> {
    await this.db.user.update({
      where: { id: userId },
      data: {
        failedLoginAttempts: 0,
        lockedUntil: null,
        lastLogin: new Date(),
      },
    });
  }

  async createRefreshToken(input: CreateRefreshTokenInput): Promise<void> {
    await this.db.refreshToken.create({
      data: {
        tokenHash: input.tokenHash,
        userId: input.userId,
        expiresAt: input.expiresAt,
        lastUsedAt: new Date(),
        device: input.device,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
      },
    });
  }

  /**
   * Atomic Login Session Update wrapping user login record & refresh token creation in prisma.$transaction
   */
  async recordLoginSession(userId: string, input: CreateRefreshTokenInput): Promise<void> {
    await this.db.$transaction(async (transaction) => {
      await transaction.user.update({
        where: { id: userId },
        data: {
          failedLoginAttempts: 0,
          lockedUntil: null,
          lastLogin: new Date(),
        },
      });

      await transaction.refreshToken.create({
        data: {
          tokenHash: input.tokenHash,
          userId: input.userId,
          expiresAt: input.expiresAt,
          lastUsedAt: new Date(),
          device: input.device,
          ipAddress: input.ipAddress,
          userAgent: input.userAgent,
        },
      });
    });
  }

  rotateRefreshToken(input: RotateRefreshTokenInput): Promise<AuthUserRecord | null> {
    return this.db.$transaction(async (transaction) => {
      const storedToken = await transaction.refreshToken.findUnique({
        where: { tokenHash: input.currentTokenHash },
        include: {
          user: {
            select: authUserSelect,
          },
        },
      });

      if (
        !storedToken ||
        storedToken.userId !== input.expectedUserId ||
        storedToken.user.organizationId !== input.expectedOrganizationId ||
        storedToken.revokedAt !== null ||
        storedToken.expiresAt <= input.now ||
        storedToken.user.deletedAt !== null ||
        !storedToken.user.isActive ||
        storedToken.user.organization.deletedAt !== null ||
        !storedToken.user.organization.isActive
      ) {
        return null;
      }

      const consumed = await transaction.refreshToken.updateMany({
        where: {
          id: storedToken.id,
          revokedAt: null,
          expiresAt: { gt: input.now },
        },
        data: {
          revokedAt: input.now,
          lastUsedAt: input.now,
        },
      });

      if (consumed.count !== 1) {
        return null;
      }

      await transaction.refreshToken.create({
        data: {
          tokenHash: input.replacementTokenHash,
          userId: storedToken.userId,
          expiresAt: input.replacementExpiresAt,
          lastUsedAt: input.now,
          device: storedToken.device ?? input.device,
          ipAddress: storedToken.ipAddress ?? input.ipAddress,
          userAgent: storedToken.userAgent ?? input.userAgent,
        },
      });

      return storedToken.user;
    });
  }

  async revokeRefreshToken(tokenHash: string, expectedUserId: string): Promise<void> {
    await this.db.refreshToken.updateMany({
      where: {
        tokenHash,
        userId: expectedUserId,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
        lastUsedAt: new Date(),
      },
    });
  }
}

export const authRepository = new AuthRepository();
