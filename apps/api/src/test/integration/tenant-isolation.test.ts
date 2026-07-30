import request from 'supertest';
import app from '../../app';
import { prisma } from '../../config/prisma';
import { closeRedisClient } from '../../core/redis/redis.client';
import { allQueues } from '../../modules/jobs/queues';
import { signAccessToken } from '../../core/security/jwt';
import { Role } from '@prisma/client';

describe('Tenant Isolation & Soft-Delete Security Integration Tests', () => {
  let orgAId: string;
  let orgBId: string;
  let userAId: string;
  let userBId: string;
  let tokenUserA: string;
  let tokenUserB: string;
  let projectAId: string;
  let projectBId: string;

  beforeAll(async () => {
    // 1. Clean test database tables
    await prisma.task.deleteMany();
    await prisma.project.deleteMany();
    await prisma.refreshToken.deleteMany();
    await prisma.user.deleteMany();
    await prisma.organization.deleteMany();

    // 2. Create Organization A & User A
    const orgA = await prisma.organization.create({
      data: { name: 'Tenant Alpha', slug: 'tenant-alpha' },
    });
    orgAId = orgA.id;

    const userA = await prisma.user.create({
      data: {
        organizationId: orgAId,
        firstName: 'Alice',
        lastName: 'Alpha',
        email: 'alice@alpha.com',
        password: '$2b$12$DummyPasswordHashForIntegrationTest1234567890',
        role: Role.ADMIN,
      },
    });
    userAId = userA.id;
    tokenUserA = signAccessToken({ userId: userAId, organizationId: orgAId });

    // 3. Create Organization B & User B
    const orgB = await prisma.organization.create({
      data: { name: 'Tenant Beta', slug: 'tenant-beta' },
    });
    orgBId = orgB.id;

    const userB = await prisma.user.create({
      data: {
        organizationId: orgBId,
        firstName: 'Bob',
        lastName: 'Beta',
        email: 'bob@beta.com',
        password: '$2b$12$DummyPasswordHashForIntegrationTest1234567890',
        role: Role.ADMIN,
      },
    });
    userBId = userB.id;
    tokenUserB = signAccessToken({ userId: userBId, organizationId: orgBId });

    // 4. Create Project A under Org A and Project B under Org B
    const projectA = await prisma.project.create({
      data: {
        organizationId: orgAId,
        ownerId: userAId,
        name: 'Project Alpha Secret',
        key: 'PALPHA',
      },
    });
    projectAId = projectA.id;

    const projectB = await prisma.project.create({
      data: {
        organizationId: orgBId,
        ownerId: userBId,
        name: 'Project Beta Secret',
        key: 'PBETA',
      },
    });
    projectBId = projectB.id;
  });

  afterAll(async () => {
    await prisma.task.deleteMany();
    await prisma.project.deleteMany();
    await prisma.refreshToken.deleteMany();
    await prisma.user.deleteMany();
    await prisma.organization.deleteMany();
    await Promise.all(allQueues.map((queue) => queue.close()));
    await closeRedisClient();
    await prisma.$disconnect();
  });

  describe('1. Cross-Tenant Read & Mutation Isolation', () => {
    it('User A in Org A MUST NOT be able to read Project B belonging to Org B', async () => {
      const response = await request(app)
        .get(`/api/v1/projects/${projectBId}`)
        .set('Authorization', `Bearer ${tokenUserA}`);

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error');
    });

    it('User B in Org B MUST NOT be able to read Project A belonging to Org A', async () => {
      const response = await request(app)
        .get(`/api/v1/projects/${projectAId}`)
        .set('Authorization', `Bearer ${tokenUserB}`);

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error');
    });

    it('User A in Org A MUST NOT see Org B projects in list endpoint', async () => {
      const response = await request(app)
        .get('/api/v1/projects')
        .set('Authorization', `Bearer ${tokenUserA}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toBeDefined();

      const returnedProjectIds = response.body.data.projects.map((p: any) => p.id);
      expect(returnedProjectIds).toContain(projectAId);
      expect(returnedProjectIds).not.toContain(projectBId);
    });
  });

  describe('2. Soft-Delete Filtering Integrity', () => {
    let taskId: string;

    it('creates a task under Org A, soft-deletes it, and verifies exclusion from task list', async () => {
      // 1. Create task under Org A
      const createResponse = await request(app)
        .post('/api/v1/tasks')
        .set('Authorization', `Bearer ${tokenUserA}`)
        .send({
          projectId: projectAId,
          title: 'Sensitive Task to be Soft-Deleted',
          status: 'TODO',
          priority: 'HIGH',
        });

      expect(createResponse.status).toBe(201);
      taskId = createResponse.body.id;
      expect(taskId).toBeDefined();

      // 2. Verify task appears in Org A task list
      const initialListResponse = await request(app)
        .get('/api/v1/tasks')
        .set('Authorization', `Bearer ${tokenUserA}`);

      expect(initialListResponse.status).toBe(200);
      const initialTaskIds = initialListResponse.body.data.map((t: any) => t.id);
      expect(initialTaskIds).toContain(taskId);

      // 3. Perform soft delete
      const deleteResponse = await request(app)
        .delete(`/api/v1/tasks/${taskId}`)
        .set('Authorization', `Bearer ${tokenUserA}`);

      expect(deleteResponse.status).toBe(200);

      // 4. Verify task is filtered out from list endpoint
      const postDeleteListResponse = await request(app)
        .get('/api/v1/tasks')
        .set('Authorization', `Bearer ${tokenUserA}`);

      expect(postDeleteListResponse.status).toBe(200);
      const postDeleteTaskIds = postDeleteListResponse.body.data.map((t: any) => t.id);
      expect(postDeleteTaskIds).not.toContain(taskId);

      // 5. Verify direct ID GET also returns 404
      const getByIdResponse = await request(app)
        .get(`/api/v1/tasks/${taskId}`)
        .set('Authorization', `Bearer ${tokenUserA}`);

      expect(getByIdResponse.status).toBe(404);
    });
  });
});
