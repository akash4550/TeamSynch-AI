import { CookieOptions, Request, Response } from 'express';

import { env } from '../../config/env';
import { verifyRefreshToken } from '../../core/security/jwt';

export const REFRESH_COOKIE_NAME = 'teamsynch-ai_refresh';
export const REFRESH_COOKIE_PATH = '/api/v1/auth';

const refreshCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
sameSite: env.NODE_ENV === 'production' ? 'none' : 'strict',
  path: REFRESH_COOKIE_PATH,
};

const readCookieValue = (
  cookieHeader: string | undefined,
  cookieName: string,
): string | undefined => {
  if (!cookieHeader) {
    return undefined;
  }

  for (const cookie of cookieHeader.split(';')) {
    const separatorIndex = cookie.indexOf('=');
    if (separatorIndex < 1) {
      continue;
    }

    const name = cookie.slice(0, separatorIndex).trim();
    if (name !== cookieName) {
      continue;
    }

    const rawValue = cookie.slice(separatorIndex + 1).trim();
    if (rawValue.length === 0) {
      return undefined;
    }

    try {
      return decodeURIComponent(rawValue);
    } catch {
      return undefined;
    }
  }

  return undefined;
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
  return readCookieValue(request.headers.cookie, REFRESH_COOKIE_NAME);
};
