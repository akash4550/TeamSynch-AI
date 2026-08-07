import { Request, Response, NextFunction } from 'express';
import { AppError } from '../errors/AppError';
import { EntitlementService, EntitlementFeature } from '../../modules/billing/entitlement.service';

const entitlementService = new EntitlementService();

export const requireEntitlement = (feature: EntitlementFeature) => {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (!req.user || !req.user.organizationId) {
        return next(new AppError('Unauthorized - Missing tenant context', 401));
      }

      await entitlementService.checkEntitlement(req.user.organizationId, feature);
      next();
    } catch (error) {
      next(error);
    }
  };
};

/*
 * BUG FIX (#55): storage uploads need the quota gate to see the incoming
 * file size, which only exists AFTER multer has parsed the multipart body
 * — mount this AFTER `upload.single(...)` on multipart document routes.
 */
export const requireStorageEntitlement = () => {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (!req.user || !req.user.organizationId) {
        return next(new AppError('Unauthorized - Missing tenant context', 401));
      }

      await entitlementService.checkEntitlement(req.user.organizationId, 'STORAGE', {
        additionalBytes: req.file?.size ?? 0,
      });
      next();
    } catch (error) {
      next(error);
    }
  };
};
