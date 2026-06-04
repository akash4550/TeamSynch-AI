import { createHash } from 'node:crypto';
import bcrypt from 'bcrypt';

import { AppError } from '../../core/errors/AppError';
import {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
} from '../../core/security/jwt';
import { AuthRepository, AuthUserRecord, authRepository } from './auth.repository';
import {
  AuthenticatedUser,
  CurrentSessionResponse,
  LoginDto,
  LoginMetadata,
  LoginResponse,
  RefreshResponse,
} from './auth.dto';

const INVALID_CREDENTIALS_MESSAGE = 'Invalid credentials';
const INVALID_ACCESS_TOKEN_MESSAGE = 'Invalid or expired access token';
const INVALID_REFRESH_TOKEN_MESSAGE = 'Invalid or expired refresh token';
const DUMMY_PASSWORD_HASH = '$2b$12$5L3mcGTO7tRHMw713gAaZ.d9PN2rc4zQR4wH0rGy63lHjxFbxFnOG';

export class AuthService {
  constructor(private readonly repository: AuthRepository = authRepository) {}

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private isActiveIdentity(user: AuthUserRecord): boolean {
    return (
      user.deletedAt === null &&
      user.isActive &&
      user.organization.deletedAt === null &&
      user.organization.isActive &&
      user.organizationId === user.organization.id
    );
  }

  private toSession(user: AuthUserRecord): CurrentSessionResponse {
    return {
      user: {
        id: user.id,
        organizationId: user.organizationId,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        avatar: user.avatar,
        emailVerified: user.emailVerified,
        lastLogin: user.lastLogin,
        createdAt: user.createdAt,
      },
      organization: {
        id: user.organization.id,
        name: user.organization.name,
        slug: user.organization.slug,
        logo: user.organization.logo,
      },
    };
  }

  async login(data: LoginDto, metadata?: LoginMetadata): Promise<LoginResponse> {
    const email = data.email.toLowerCase().trim();
    const user = await this.repository.findLoginUser(email, data.organizationId);
    const passwordMatches = await bcrypt.compare(
      data.password,
      user?.password ?? DUMMY_PASSWORD_HASH,
    );

    const identityIsActive = user ? this.isActiveIdentity(user) : false;
    const accountIsUnlocked = user?.lockedUntil ? user.lockedUntil <= new Date() : true;

    if (!user || !passwordMatches || !identityIsActive || !accountIsUnlocked) {
      if (user && identityIsActive && !passwordMatches) {
        await this.repository.recordFailedLogin(user.id);
      }
      throw new AppError(INVALID_CREDENTIALS_MESSAGE, 401);
    }

    const identity = {
      userId: user.id,
      organizationId: user.organizationId,
    };
    const accessToken = signAccessToken(identity);
    const refreshToken = signRefreshToken(identity);
    const refreshClaims = verifyRefreshToken(refreshToken);

    // Atomic login session update wrapping user update & refresh token creation
    await this.repository.recordLoginSession(user.id, {
      tokenHash: this.hashToken(refreshToken),
      userId: user.id,
      expiresAt: new Date(refreshClaims.exp * 1000),
      device: metadata?.device,
      ipAddress: metadata?.ipAddress,
      userAgent: metadata?.userAgent,
    });

    return {
      ...this.toSession(user),
      accessToken,
      refreshToken,
    };
  }

  async authenticate(token: string): Promise<AuthenticatedUser> {
    let claims;
    try {
      claims = verifyAccessToken(token);
    } catch {
      throw new AppError(INVALID_ACCESS_TOKEN_MESSAGE, 401);
    }

    return this.loadAuthoritativeIdentity(claims.sub, claims.organizationId);
  }

  async loadAuthoritativeIdentity(
    userId: string,
    organizationId: string,
  ): Promise<AuthenticatedUser> {
    const user = await this.repository.findAuthoritativeUser(userId);
    if (
      !user ||
      !this.isActiveIdentity(user) ||
      user.organizationId !== organizationId
    ) {
      throw new AppError(INVALID_ACCESS_TOKEN_MESSAGE, 401);
    }

    return {
      id: user.id,
      organizationId: user.organizationId,
      role: user.role,
    };
  }

  async refreshToken(token: string): Promise<RefreshResponse> {
    let claims;
    try {
      claims = verifyRefreshToken(token);
    } catch {
      throw new AppError(INVALID_REFRESH_TOKEN_MESSAGE, 401);
    }

    const replacementRefreshToken = signRefreshToken({
      userId: claims.sub,
      organizationId: claims.organizationId,
    });
    const replacementClaims = verifyRefreshToken(replacementRefreshToken);
    const rotatedUser = await this.repository.rotateRefreshToken({
      currentTokenHash: this.hashToken(token),
      expectedUserId: claims.sub,
      expectedOrganizationId: claims.organizationId,
      replacementTokenHash: this.hashToken(replacementRefreshToken),
      replacementExpiresAt: new Date(replacementClaims.exp * 1000),
      now: new Date(),
    });

    if (!rotatedUser) {
      throw new AppError(INVALID_REFRESH_TOKEN_MESSAGE, 401);
    }

    return {
      ...this.toSession(rotatedUser),
      accessToken: signAccessToken({
        userId: rotatedUser.id,
        organizationId: rotatedUser.organizationId,
      }),
      refreshToken: replacementRefreshToken,
    };
  }

  async logout(token: string): Promise<void> {
    let claims;
    try {
      claims = verifyRefreshToken(token);
    } catch {
      throw new AppError(INVALID_REFRESH_TOKEN_MESSAGE, 401);
    }

    await this.repository.revokeRefreshToken(this.hashToken(token), claims.sub);
  }

  async getCurrentSession(
    userId: string,
    organizationId: string,
  ): Promise<CurrentSessionResponse> {
    const user = await this.repository.findAuthoritativeUser(userId);
    if (
      !user ||
      !this.isActiveIdentity(user) ||
      user.organizationId !== organizationId
    ) {
      throw new AppError(INVALID_ACCESS_TOKEN_MESSAGE, 401);
    }

    return this.toSession(user);
  }
}

export const authService = new AuthService();
