import { createHash, randomUUID } from 'node:crypto';
import { AddressInfo } from 'node:net';
import { Server } from 'node:http';
import bcrypt from 'bcrypt';
import jwt, { SignOptions } from 'jsonwebtoken';
import { Role } from '@prisma/client';

import app from '../../../app';
import { env } from '../../../config/env';
import { prisma } from '../../../config/prisma';
import { closeRedisClient, getRedisClient } from '../../../core/redis/redis.client';
import { allQueues } from '../../jobs/queues';
import {
  REFRESH_COOKIE_NAME,
  REFRESH_COOKIE_PATH,
} from '../auth.cookie';

interface JsonResponse {
  success: boolean;
  data?: any;
  message?: string;
  error?: {
    message: string;
  };
}

interface TestResponse {
  status: number;
  body: JsonResponse;
  headers: Headers;
}

interface RefreshCookie {
  header: string;
  pair: string;
  token: string;
}

const TEST_PASSWORD = 'CorrectPassword123!';
const TRUSTED_ORIGIN = new URL(env.FRONTEND_URL).origin;
let passwordHash: string;
let server: Server;
let baseUrl: string;
let organizationId: string;
let userId: string;

const request = async (
  path: string,
  options: RequestInit = {},
): Promise<TestResponse> => {
  const headers = new Headers(options.headers);
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers,
  });
  const responseText = await response.text();

  return {
    status: response.status,
    body: responseText
      ? JSON.parse(responseText) as JsonResponse
      : { success: response.ok },
    headers: response.headers,
  };
};

const login = (password = TEST_PASSWORD) => request('/api/v1/auth/login', {
  method: 'POST',
  headers: {
    Origin: TRUSTED_ORIGIN,
  },
  body: JSON.stringify({
    email: 'auth.user@example.com',
    password,
    organizationId,
  }),
});

const me = (token: string) => request('/api/v1/auth/me', {
  headers: {
    Authorization: `Bearer ${token}`,
  },
});

const refresh = (cookie: string) => request('/api/v1/auth/refresh', {
  method: 'POST',
  headers: {
    Cookie: cookie,
    Origin: TRUSTED_ORIGIN,
  },
});

const logout = (cookie?: string) => request('/api/v1/auth/logout', {
  method: 'POST',
  headers: {
    ...(cookie ? { Cookie: cookie } : {}),
    Origin: TRUSTED_ORIGIN,
  },
});

const getRefreshCookie = (response: TestResponse): RefreshCookie => {
  const header = response.headers.get('set-cookie');
  if (!header) {
    throw new Error('Expected response to set the refresh cookie');
  }

  const pair = header.split(';', 1)[0];
  const separatorIndex = pair.indexOf('=');
  const name = pair.slice(0, separatorIndex);
  const token = pair.slice(separatorIndex + 1);

  if (separatorIndex < 1 || name !== REFRESH_COOKIE_NAME || token.length === 0) {
    throw new Error('Response contained an invalid refresh cookie');
  }

  return { header, pair, token };
};

const expectRefreshCookieFlags = (cookie: RefreshCookie): void => {
  const attributes = cookie.header
    .split(';')
    .slice(1)
    .map((attribute) => attribute.trim());

  expect(attributes).toContain('HttpOnly');
  expect(attributes).toContain('SameSite=Strict');
  expect(attributes).toContain(`Path=${REFRESH_COOKIE_PATH}`);
  expect(attributes).toContainEqual(expect.stringMatching(/^Max-Age=\d+$/));
  expect(attributes).not.toContainEqual(expect.stringMatching(/^Domain=/i));
  expect(attributes).not.toContain('Secure');

  const maxAge = Number(cookie.header.match(/Max-Age=(\d+)/)?.[1]);
  expect(maxAge).toBeGreaterThan(0);
  expect(maxAge).toBeLessThanOrEqual(7 * 24 * 60 * 60);
};

const expectClearedRefreshCookie = (response: TestResponse): void => {
  const header = response.headers.get('set-cookie');
  expect(header).toContain(`${REFRESH_COOKIE_NAME}=`);
  expect(header).toContain(`Path=${REFRESH_COOKIE_PATH}`);
  expect(header).toContain('HttpOnly');
  expect(header).toContain('SameSite=Strict');
  expect(header).toMatch(/Expires=Thu, 01 Jan 1970 00:00:00 GMT/i);
};

const signAccessLikeToken = ({
  audience = env.JWT_ACCESS_AUDIENCE,
  issuer = env.JWT_ISSUER,
  type = 'access',
  expiresIn = '15m',
  tokenOrganizationId = organizationId,
}: {
  audience?: string;
  issuer?: string;
  type?: string;
  expiresIn?: SignOptions['expiresIn'];
  tokenOrganizationId?: string;
} = {}): string => jwt.sign(
  {
    type,
    organizationId: tokenOrganizationId,
    jti: randomUUID(),
  },
  env.JWT_ACCESS_SECRET,
  {
    algorithm: 'HS256',
    audience,
    issuer,
    subject: userId,
    expiresIn,
  },
);

const signExpiredRefreshToken = (): string => jwt.sign(
  {
    type: 'refresh',
    organizationId,
    jti: randomUUID(),
  },
  env.JWT_REFRESH_SECRET,
  {
    algorithm: 'HS256',
    audience: env.JWT_REFRESH_AUDIENCE,
    issuer: env.JWT_ISSUER,
    subject: userId,
    expiresIn: -1,
  },
);

beforeAll(async () => {
  passwordHash = await bcrypt.hash(TEST_PASSWORD, 12);
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
});

beforeEach(async () => {
  await prisma.refreshToken.deleteMany();
  await prisma.document.deleteMany();
  await prisma.task.deleteMany();
  await prisma.project.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();

  const organization = await prisma.organization.create({
    data: {
      name: 'Authentication Test Organization',
      slug: `authentication-test-${randomUUID()}`,
    },
  });
  organizationId = organization.id;

  const user = await prisma.user.create({
    data: {
      organizationId,
      firstName: 'Auth',
      lastName: 'User',
      email: 'auth.user@example.com',
      password: passwordHash,
      role: Role.ADMIN,
      emailVerified: true,
    },
  });
  userId = user.id;
});

afterAll(async () => {
  await prisma.refreshToken.deleteMany();
  await prisma.document.deleteMany();
  await prisma.task.deleteMany();
  await prisma.project.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
    server.closeAllConnections();
  });
  await Promise.all(allQueues.map((queue) => queue.close()));
  await closeRedisClient();
  await prisma.$disconnect();
});

describe('canonical backend authentication', () => {
  test('authentication routes are mounted', async () => {
    const response = await request('/api/v1/auth/login', {
      method: 'POST',
      headers: { Origin: TRUSTED_ORIGIN },
      body: JSON.stringify({}),
    });
    expect(response.status).toBe(400);
  });

  test('valid login returns the authoritative session and stores refresh credentials only in a cookie', async () => {
    const response = await login();
    const refreshCookie = getRefreshCookie(response);

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      user: {
        id: userId,
        organizationId,
        role: Role.ADMIN,
      },
      organization: {
        id: organizationId,
      },
    });
    expect(response.body.data?.accessToken).toEqual(expect.any(String));
    expect(response.body.data).not.toHaveProperty('refreshToken');
    expect(JSON.stringify(response.body)).not.toContain(refreshCookie.token);
    expectRefreshCookieFlags(refreshCookie);
    expect(response.headers.get('access-control-allow-origin')).toBe(TRUSTED_ORIGIN);
    expect(response.headers.get('access-control-allow-credentials')).toBe('true');
  });

  test('credentialed CORS preflight is restricted to the configured frontend origin', async () => {
    const response = await request('/api/v1/auth/refresh', {
      method: 'OPTIONS',
      headers: {
        Origin: TRUSTED_ORIGIN,
        'Access-Control-Request-Method': 'POST',
      },
    });
    const untrustedResponse = await request('/api/v1/auth/refresh', {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://untrusted.example',
        'Access-Control-Request-Method': 'POST',
      },
    });

    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe(TRUSTED_ORIGIN);
    expect(response.headers.get('access-control-allow-credentials')).toBe('true');
    expect(untrustedResponse.headers.get('access-control-allow-origin'))
      .not.toBe('https://untrusted.example');
  });

  test('login, refresh, and logout reject an untrusted browser origin without consuming the session', async () => {
    const untrustedOrigin = 'https://untrusted.example';
    const rejectedLogin = await request('/api/v1/auth/login', {
      method: 'POST',
      headers: { Origin: untrustedOrigin },
      body: JSON.stringify({
        email: 'auth.user@example.com',
        password: TEST_PASSWORD,
        organizationId,
      }),
    });
    expect(rejectedLogin.status).toBe(403);

    const loginResponse = await login();
    const cookie = getRefreshCookie(loginResponse);
    const rejectedRefresh = await request('/api/v1/auth/refresh', {
      method: 'POST',
      headers: { Cookie: cookie.pair, Origin: untrustedOrigin },
    });
    const rejectedLogout = await request('/api/v1/auth/logout', {
      method: 'POST',
      headers: { Cookie: cookie.pair, Origin: 'null' },
    });

    expect(rejectedRefresh.status).toBe(403);
    expect(rejectedLogout.status).toBe(403);
    expect(JSON.stringify(rejectedRefresh.body)).not.toContain(cookie.token);
    expect(JSON.stringify(rejectedLogout.body)).not.toContain(cookie.token);
    expect((await refresh(cookie.pair)).status).toBe(200);
  });

  test('trusted frontend origin is accepted when browser metadata is cross-site', async () => {
  const response = await request('/api/v1/auth/login', {
    method: 'POST',
    headers: {
      Origin: TRUSTED_ORIGIN,
      'Sec-Fetch-Site': 'cross-site',
    },
    body: JSON.stringify({
      email: 'auth.user@example.com',
      password: TEST_PASSWORD,
      organizationId,
    }),
  });

  expect(response.status).toBe(200);
  expect(response.headers.get('set-cookie')).not.toBeNull();
});

  test('refresh tokens supplied in a JSON body are rejected', async () => {
    const loginResponse = await login();
    const cookie = getRefreshCookie(loginResponse);
    const response = await request('/api/v1/auth/refresh', {
      method: 'POST',
      headers: { Origin: TRUSTED_ORIGIN },
      body: JSON.stringify({ refreshToken: cookie.token }),
    });

    expect(response.status).toBe(400);
    expect(JSON.stringify(response.body)).not.toContain(cookie.token);
  });

  test('invalid password returns a generic authentication failure', async () => {
    const response = await login('WrongPassword123!');
    expect(response.status).toBe(401);
    expect(response.body.error?.message).toBe('Invalid credentials');
  });

  test('inactive user login is rejected generically', async () => {
    await prisma.user.update({ where: { id: userId }, data: { isActive: false } });
    const response = await login();
    expect(response.status).toBe(401);
    expect(response.body.error?.message).toBe('Invalid credentials');
  });

  test('deleted user login is rejected generically', async () => {
    await prisma.user.update({ where: { id: userId }, data: { deletedAt: new Date() } });
    const response = await login();
    expect(response.status).toBe(401);
    expect(response.body.error?.message).toBe('Invalid credentials');
  });

  test('inactive organization login is rejected generically', async () => {
    await prisma.organization.update({ where: { id: organizationId }, data: { isActive: false } });
    const response = await login();
    expect(response.status).toBe(401);
    expect(response.body.error?.message).toBe('Invalid credentials');
  });

  test('deleted organization login is rejected generically', async () => {
    await prisma.organization.update({ where: { id: organizationId }, data: { deletedAt: new Date() } });
    const response = await login();
    expect(response.status).toBe(401);
    expect(response.body.error?.message).toBe('Invalid credentials');
  });

  test('a valid access token authenticates the current-session route', async () => {
    const loginResponse = await login();
    const response = await me(loginResponse.body.data?.accessToken);
    expect(response.status).toBe(200);
    expect(response.body.data?.user.id).toBe(userId);
  });

  test('a refresh token is rejected by normal access middleware', async () => {
    const loginResponse = await login();
    const response = await me(getRefreshCookie(loginResponse).token);
    expect(response.status).toBe(401);
  });

  test('a token with the wrong audience is rejected', async () => {
    const response = await me(signAccessLikeToken({ audience: 'wrong-audience' }));
    expect(response.status).toBe(401);
  });

  test('a token with the wrong issuer is rejected', async () => {
    const response = await me(signAccessLikeToken({ issuer: 'wrong-issuer' }));
    expect(response.status).toBe(401);
  });

  test('a token with the wrong type is rejected', async () => {
    const response = await me(signAccessLikeToken({ type: 'refresh' }));
    expect(response.status).toBe(401);
  });

  test('a token using an unexpected algorithm is rejected', async () => {
    const token = jwt.sign(
      {
        type: 'access',
        organizationId,
        jti: randomUUID(),
      },
      env.JWT_ACCESS_SECRET,
      {
        algorithm: 'HS384',
        audience: env.JWT_ACCESS_AUDIENCE,
        issuer: env.JWT_ISSUER,
        subject: userId,
        expiresIn: '15m',
      },
    );
    expect((await me(token)).status).toBe(401);
  });

  test('an expired access token is rejected', async () => {
    const response = await me(signAccessLikeToken({ expiresIn: -1 }));
    expect(response.status).toBe(401);
  });

  test('a token for a different organization is rejected', async () => {
    const response = await me(signAccessLikeToken({ tokenOrganizationId: randomUUID() }));
    expect(response.status).toBe(401);
  });

  test('refresh tokens are stored as SHA-256 hashes rather than plaintext', async () => {
    const loginResponse = await login();
    const refreshToken = getRefreshCookie(loginResponse).token;
    const storedToken = await prisma.refreshToken.findFirstOrThrow();
    expect(storedToken.tokenHash).not.toBe(refreshToken);
    expect(storedToken.tokenHash).toBe(
      createHash('sha256').update(refreshToken).digest('hex'),
    );
  });

  test('refreshing rotates the cookie, returns authoritative session data, and prevents token reuse', async () => {
    const loginResponse = await login();
    const original = getRefreshCookie(loginResponse);
    await prisma.user.update({ where: { id: userId }, data: { role: Role.MANAGER } });

    const rotated = await refresh(original.pair);
    const rotatedCookie = getRefreshCookie(rotated);

    expect(rotated.status).toBe(200);
    expect(rotatedCookie.token).not.toBe(original.token);
    expect(rotated.body.data).toMatchObject({
      user: {
        id: userId,
        organizationId,
        role: Role.MANAGER,
      },
      organization: { id: organizationId },
    });
    expect(rotated.body.data?.accessToken).toEqual(expect.any(String));
    expect(rotated.body.data).not.toHaveProperty('refreshToken');
    expect(JSON.stringify(rotated.body)).not.toContain(rotatedCookie.token);
    expectRefreshCookieFlags(rotatedCookie);

    const reused = await refresh(original.pair);
    expect(reused.status).toBe(401);
    expect(JSON.stringify(reused.body)).not.toContain(original.token);
    expect((await refresh(rotatedCookie.pair)).status).toBe(200);
  });

  test('two concurrent refresh attempts cannot both succeed', async () => {
    const loginResponse = await login();
    const cookie = getRefreshCookie(loginResponse);
    const responses = await Promise.all([refresh(cookie.pair), refresh(cookie.pair)]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 401]);

    const successfulResponse = responses.find((response) => response.status === 200);
    if (!successfulResponse) {
      throw new Error('Expected one concurrent refresh request to succeed');
    }
    const rotatedCookie = getRefreshCookie(successfulResponse);
    expect(successfulResponse.body.data).not.toHaveProperty('refreshToken');
    expect((await refresh(rotatedCookie.pair)).status).toBe(200);
  });

  test('logout is idempotent and prevents refresh-token reuse', async () => {
    const loginResponse = await login();
    const cookie = getRefreshCookie(loginResponse);
    const firstLogout = await logout(cookie.pair);
    const repeatedLogout = await logout(cookie.pair);

    expect(firstLogout.status).toBe(200);
    expect(repeatedLogout.status).toBe(200);
    expectClearedRefreshCookie(firstLogout);
    expectClearedRefreshCookie(repeatedLogout);
    expect((await refresh(cookie.pair)).status).toBe(401);
  });

  test('logout clears absent, malformed, and expired refresh cookies safely', async () => {
    const absent = await logout();
    const malformed = await logout(`${REFRESH_COOKIE_NAME}=not-a-refresh-token`);
    const expired = await logout(
      `${REFRESH_COOKIE_NAME}=${signExpiredRefreshToken()}`,
    );

    for (const response of [absent, malformed, expired]) {
      expect(response.status).toBe(200);
      expectClearedRefreshCookie(response);
    }
  });

  test('current-session response excludes sensitive fields and reloads role', async () => {
    const loginResponse = await login();
    await prisma.user.update({ where: { id: userId }, data: { role: Role.MANAGER } });
    const response = await me(loginResponse.body.data?.accessToken);
    const serialized = JSON.stringify(response.body.data);
    expect(response.status).toBe(200);
    expect(response.body.data?.user.role).toBe(Role.MANAGER);
    expect(serialized).not.toContain('password');
    expect(serialized).not.toContain('tokenHash');
    expect(serialized).not.toContain('failedLoginAttempts');
    expect(serialized).not.toContain('lockedUntil');
  });

  test('deactivating the user invalidates subsequent session loading', async () => {
    const loginResponse = await login();
    await prisma.user.update({ where: { id: userId }, data: { isActive: false } });
    expect((await me(loginResponse.body.data?.accessToken)).status).toBe(401);
  });

  test('deactivating the organization invalidates subsequent session loading', async () => {
    const loginResponse = await login();
    await prisma.organization.update({ where: { id: organizationId }, data: { isActive: false } });
    expect((await me(loginResponse.body.data?.accessToken)).status).toBe(401);
  });

  test('refresh rechecks active user and organization state', async () => {
    const loginResponse = await login();
    const cookie = getRefreshCookie(loginResponse);
    await prisma.organization.update({ where: { id: organizationId }, data: { isActive: false } });
    expect((await refresh(cookie.pair)).status).toBe(401);
  });

  test('refresh rejects a user deactivated after token issuance', async () => {
    const loginResponse = await login();
    const cookie = getRefreshCookie(loginResponse);
    await prisma.user.update({ where: { id: userId }, data: { isActive: false } });
    expect((await refresh(cookie.pair)).status).toBe(401);
  });

  test('login resolves duplicate email identities by validated organization ID', async () => {
    const secondOrganization = await prisma.organization.create({
      data: {
        name: 'Second Authentication Organization',
        slug: `second-authentication-test-${randomUUID()}`,
        users: {
          create: {
            firstName: 'Other',
            lastName: 'User',
            email: 'auth.user@example.com',
            password: await bcrypt.hash('OtherPassword123!', 12),
            role: Role.EMPLOYEE,
          },
        },
      },
    });

    const response = await request('/api/v1/auth/login', {
      method: 'POST',
      headers: { Origin: TRUSTED_ORIGIN },
      body: JSON.stringify({
        email: 'auth.user@example.com',
        password: 'OtherPassword123!',
        organizationId: secondOrganization.id,
      }),
    });
    expect(response.status).toBe(200);
    expect(response.body.data?.organization.id).toBe(secondOrganization.id);
    expect(response.body.data).not.toHaveProperty('refreshToken');
    expectRefreshCookieFlags(getRefreshCookie(response));
  });
});
