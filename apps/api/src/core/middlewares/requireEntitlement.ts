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
