import request from 'supertest';
import express from 'express';
import app from '../../app';
import { prisma } from '../../config/prisma';
import { closeRedisClient } from '../../core/redis/redis.client';
import { allQueues } from '../../modules/jobs/queues';
import { signAccessToken } from '../../core/security/jwt';
import { Role } from '@prisma/client';
import { errorMiddleware } from '../../core/middlewares/errorMiddleware';

function assertDedicatedTestDatabase() {
  const dbUrl = process.env.DATABASE_URL || '';
  const isTestDb = dbUrl.includes('_test') || dbUrl.includes('test_db') || dbUrl.includes('55433');
  if (!isTestDb) {
    throw new Error(`CRITICAL SAFETY GUARD: Refusing to run destructive integration test cleanup on non-test database: ${dbUrl}`);
  }
}

describe('Comprehensive Security & OWASP ASVS Integration Tests', () => {
  let orgAId: string;
  let orgBId: string;
  let userAId: string;
  let userBId: string;
  let tokenUserA: string;
  let tokenUserB: string;

  beforeAll(async () => {
    assertDedicatedTestDatabase();

    // Clean test tables
    await prisma.activityLog.deleteMany();
    await prisma.cRMActivity.deleteMany();
    await prisma.opportunity.deleteMany();
    await prisma.lead.deleteMany();
    await prisma.client.deleteMany();
    await prisma.document.deleteMany();
    await prisma.task.deleteMany();
    await prisma.project.deleteMany();
    await prisma.refreshToken.deleteMany();
    await prisma.user.deleteMany();
    await prisma.organization.deleteMany();

    // Org A
    const orgA = await prisma.organization.create({
      data: { name: 'Security Org Alpha', slug: 'sec-alpha' },
    });
    orgAId = orgA.id;

    const userA = await prisma.user.create({
      data: {
        organizationId: orgAId,
        firstName: 'Alice',
        lastName: 'Admin',
        email: 'alice.admin@sec-alpha.com',
        password: '$2b$12$DummyPasswordHashForIntegrationTest1234567890',
        role: Role.ADMIN,
      },
    });
    userAId = userA.id;
    tokenUserA = signAccessToken({ userId: userAId, organizationId: orgAId });

    // Org B
    const orgB = await prisma.organization.create({
      data: { name: 'Security Org Beta', slug: 'sec-beta' },
    });
    orgBId = orgB.id;

    const userB = await prisma.user.create({
      data: {
        organizationId: orgBId,
        firstName: 'Bob',
        lastName: 'Employee',
        email: 'bob.emp@sec-beta.com',
        password: '$2b$12$DummyPasswordHashForIntegrationTest1234567890',
        role: Role.EMPLOYEE,
      },
    });
    userBId = userB.id;
    tokenUserB = signAccessToken({ userId: userBId, organizationId: orgBId });
  });

  afterAll(async () => {
    assertDedicatedTestDatabase();

    await prisma.activityLog.deleteMany();
    await prisma.cRMActivity.deleteMany();
    await prisma.opportunity.deleteMany();
    await prisma.lead.deleteMany();
    await prisma.client.deleteMany();
    await prisma.document.deleteMany();
    await prisma.task.deleteMany();
    await prisma.project.deleteMany();
    await prisma.refreshToken.deleteMany();
    await prisma.user.deleteMany();
    await prisma.organization.deleteMany();
    await Promise.all(allQueues.map((queue) => queue.close()));
    await closeRedisClient();
    await prisma.$disconnect();
  });

  describe('1. Unauthenticated & Malformed JWT Security', () => {
    it('rejects unauthenticated requests with HTTP 401', async () => {
      const response = await request(app).get('/api/v1/projects');
      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    it('rejects malformed Bearer tokens with HTTP 401', async () => {
      const response = await request(app)
        .get('/api/v1/projects')
        .set('Authorization', 'Bearer invalid_malformed_jwt_token_payload');
      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });
  });

  describe('2. RBAC & Granular Permission Enforcement', () => {
    it('denies EMPLOYEE user in Org B from accessing System Admin Audit Logs', async () => {
      const response = await request(app)
        .get('/api/v1/audit/logs')
        .set('Authorization', `Bearer ${tokenUserB}`);

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toContain('Forbidden');
    });

    it('denies EMPLOYEE user in Org B from executing Background Job operations', async () => {
      const response = await request(app)
        .get('/api/v1/system/metrics')
        .set('Authorization', `Bearer ${tokenUserB}`);

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
    });
  });

  describe('3. Production Error Redaction & Masking (Test-Only Express Instance)', () => {
    const originalEnv = process.env.NODE_ENV;

    afterEach(() => {
      process.env.NODE_ENV = originalEnv;
    });

    it('masks internal errors in production, stripping stack traces, secrets, paths, and SQL strings', async () => {
      process.env.NODE_ENV = 'production';

      const testApp = express();
      testApp.use((req: any, _res, next) => {
        req.requestId = 'test-request-id-123';
        next();
      });
      testApp.get('/test-error', (_req, _res, next) => {
        next(new Error('Sensitive SQL SELECT * FROM private_table on /var/lib/postgresql/private with SECRET_KEY_12345'));
      });
      testApp.use(errorMiddleware);

      const response = await request(testApp).get('/test-error');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({
        success: false,
        requestId: 'test-request-id-123',
        error: {
          message: 'Internal Server Error',
        },
      });

      const responseText = JSON.stringify(response.body);
      expect(responseText).not.toContain('stack');
      expect(responseText).not.toContain('/var/lib/postgresql');
      expect(responseText).not.toContain('SECRET_KEY_12345');
      expect(responseText).not.toContain('private_table');
    });
  });
});
