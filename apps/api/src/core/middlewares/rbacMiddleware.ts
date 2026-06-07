import { Request, Response, NextFunction } from 'express';
import { Role } from '@prisma/client';
import { AppError } from '../errors/AppError';
import { Permission } from '../auth/permissions';
import { ROLE_PERMISSIONS } from '../auth/rolePermissions';

export interface UserWithPermissions {
  id: string;
  organizationId: string;
  role: Role;
  customPermissions?: Permission[];
}

/**
 * Permission Policy Engine evaluator:
 * Evaluates whether a user holds a permission through:
 * 1. Role-based entitlement static mapping (`ROLE_PERMISSIONS`), OR
 * 2. Explicit user custom permission overrides (`customPermissions` array).
 */
export const hasPermission = (user: UserWithPermissions, permission: Permission): boolean => {
  if (!user) return false;

  // 1. Check custom user permission overrides if assigned
  if (user.customPermissions && Array.isArray(user.customPermissions)) {
    if (user.customPermissions.includes(permission)) {
      return true;
    }
  }

  // 2. Check static role permission entitlements
  const rolePermissions = ROLE_PERMISSIONS[user.role] || [];
  return rolePermissions.includes(permission);
};

export const requireRole = (...allowedRoles: Role[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new AppError('Unauthorized', 401));
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(new AppError('Forbidden - Insufficient role permissions', 403));
    }

    next();
  };
};

export const requirePermission = (permission: Permission) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new AppError('Unauthorized', 401));
    }

    if (!hasPermission(req.user as UserWithPermissions, permission)) {
      return next(new AppError(`Forbidden - Missing permission: ${permission}`, 403));
    }

    next();
  };
};
