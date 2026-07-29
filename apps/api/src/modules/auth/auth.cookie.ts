import { CookieOptions, Request, Response } from 'express';

import { env } from '../../config/env';
import { verifyRefreshToken } from '../../core/security/jwt';

export const REFRESH_COOKIE_NAME = 'teamsynch-ai_refresh';
export const REFRESH_COOKIE_PATH = '/api/v1/auth';

const refreshCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: 'strict',
  path: REFRESH_COOKIE_PATH,
};

export const setRefreshCookie = (response: Response, token: string): void => {
  const claims = verifyRefreshToken(token);
  response.cookie(REFRESH_COOKIE_NAME, token, {
    ...refreshCookieOptions,
    maxAge: Math.max(0, claims.exp * 1_000 - Date.now()),
  });
};

export const clearRefreshCookie = (response: Response): void => {
  response.clearCookie(REFRESH_COOKIE_NAME, refreshCookieOptions);
};

export const readRefreshCookie = (request: Request): string | undefined => {
  const value = request.cookies?.[REFRESH_COOKIE_NAME];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
};
