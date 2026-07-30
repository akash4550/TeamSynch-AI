import { randomUUID } from 'node:crypto';
import { Server } from 'node:http';
import { AddressInfo } from 'node:net';

import { Role, User } from '@prisma/client';

import app from '../../../app';
import { prisma } from '../../../config/prisma';
import { closeRedisClient } from '../../../core/redis/redis.client';
import { signAccessToken } from '../../../core/security/jwt';
import { allQueues } from '../../jobs/queues';

describe('protected metrics endpoint', () => {
  let server: Server;
  let baseUrl: string;
  let organizationId: string;
  let superAdmin: User;
  let employee: User;

  const tokenFor = (user: User): string => {
    return signAccessToken({
      userId: user.id,
      organizationId: user.organizationId,
    });
  };

  const requestMetrics = async (
    actor?: User,
  ): Promise<Response> => {
    const headers: Record<string, string> = {};

    if (actor) {
      headers.Authorization = `Bearer ${tokenFor(actor)}`;
    }

    return fetch(`${baseUrl}/api/v1/system/metrics`, {
      headers,
    });
  };

  beforeAll(async () => {
    server = app.listen(0);

    await new Promise<void>((resolve) => {
      server.once('listening', resolve);
    });

    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;

    const organization = await prisma.organization.create({
      data: {
        name: 'Metrics Integration Organization',
        slug: `metrics-integration-${randomUUID()}`,
      },
    });

    organizationId = organization.id;

    [superAdmin, employee] = await Promise.all([
      prisma.user.create({
        data: {
          organizationId,
          firstName: 'Metrics',
          lastName: 'SuperAdmin',
          email: `metrics-super-admin-${randomUUID()}@example.com`,
          password: 'metrics-test-password-hash',
          role: Role.SUPER_ADMIN,
          emailVerified: true,
          isActive: true,
        },
      }),
      prisma.user.create({
        data: {
          organizationId,
          firstName: 'Metrics',
          lastName: 'Employee',
          email: `metrics-employee-${randomUUID()}@example.com`,
          password: 'metrics-test-password-hash',
          role: Role.EMPLOYEE,
          emailVerified: true,
          isActive: true,
        },
      }),
    ]);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: {
        organizationId,
      },
    });

    await prisma.organization.delete({
      where: {
        id: organizationId,
      },
    });

    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });

      server.closeAllConnections();
    });

    await Promise.all(
      allQueues.map((queue) => queue.close()),
    );

    await closeRedisClient();
    await prisma.$disconnect();
  });

  it('rejects unauthenticated requests', async () => {
    const response = await requestMetrics();

    expect(response.status).toBe(401);
  });

  it('rejects authenticated users without the required role', async () => {
    const response = await requestMetrics(employee);

    expect(response.status).toBe(403);
  });

  it('returns Prometheus metrics to a super administrator', async () => {
  const readinessResponse = await fetch(
    `${baseUrl}/api/v1/system/ready`,
  );

  expect(readinessResponse.status).toBe(200);

  const response = await requestMetrics(superAdmin);
  const body = await response.text();

  expect(response.status).toBe(200);

  expect(response.headers.get('content-type')).toContain(
    'text/plain',
  );

  expect(body).toContain(
    '# HELP teamsynch_ai_http_requests_total',
  );

  expect(body).toContain(
    '# HELP teamsynch_ai_http_request_duration_seconds',
  );

  expect(body).toContain(
    'teamsynch_ai_process_cpu_user_seconds_total',
  );

  expect(body).toContain(
    '# HELP teamsynch_ai_queue_depth',
  );

  expect(body).toContain(
    'teamsynch_ai_queue_depth{queue="emailQueue",state="waiting"}',
  );

  expect(body).toContain(
    'teamsynch_ai_dependency_up{dependency="postgres"} 1',
  );

  expect(body).toContain(
    'teamsynch_ai_dependency_up{dependency="redis"} 1',
  );

  expect(body).toContain(
    'teamsynch_ai_dependency_check_duration_seconds_count{dependency="postgres",result="success"} 1',
  );

  expect(body).toContain(
    'teamsynch_ai_dependency_check_duration_seconds_count{dependency="redis",result="success"} 1',
  );
});
});
