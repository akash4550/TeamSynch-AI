import { NextFunction, Request, Response } from 'express';

import { env } from '../../config/env';
import { AppError } from '../../core/errors/AppError';

/*
 * NOTE (#82): `env.FRONTEND_URL` is now schema-validated as a URL at boot
 * (z.string().url() in env.ts) and env.ts also guarantees a value in every
 * environment (localhost:5173 dev default, required in production), so
 * computing the trusted origin at module load can never throw here — the
 * only historical failure mode (an INVALID URL causing an opaque
 * import-time TypeError) is now caught earlier with a readable zod
 * validation error naming the field.
 */
const trustedOrigin = new URL(env.FRONTEND_URL as string).origin;

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
