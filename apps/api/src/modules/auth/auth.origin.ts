import { NextFunction, Request, Response } from 'express';

import { env } from '../../config/env';
import { AppError } from '../../core/errors/AppError';

const trustedOrigin = new URL(env.FRONTEND_URL).origin;

export const requireTrustedAuthOrigin = (
  request: Request,
  _response: Response,
  next: NextFunction,
): void => {
  const origin = request.headers.origin;
  // Non-browser clients may omit Origin. Browser mutation requests include it,
  // and SameSite=Strict prevents the refresh cookie from being sent cross-site.
  if (origin === undefined) {
    next();
    return;
  }

  try {
    if (new URL(origin).origin !== trustedOrigin) {
      next(new AppError('Origin not allowed', 403));
      return;
    }
  } catch {
    next(new AppError('Origin not allowed', 403));
    return;
  }

  next();
};
