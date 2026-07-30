import { randomUUID } from 'node:crypto';
import { Server } from 'node:http';
import { AddressInfo } from 'node:net';

import {
  AIProvider as PrismaAIProvider,
  Project,
  Role,
  Task,
  User,
} from '@prisma/client';

import app from '../../../app';
import { prisma } from '../../../config/prisma';
import { closeRedisClient, getRedisClient } from '../../../core/redis/redis.client';
import { signAccessToken } from '../../../core/security/jwt';
import { allQueues } from '../../jobs/queues';
import { ContextBuilder } from '../context/context.builder';

interface JsonResponse {
  data?: string;
  error?: {
    message?: string;
  };
}

interface TestResponse {
  status: number;
  body: JsonResponse | null;
}

let server: Server;
let baseUrl: string;

let primaryOrganizationId: string;
let otherOrganizationId: string;

let primaryAdmin: User;
let primaryEmployee: User;
let otherTenantAdmin: User;

let primaryProject: Project;
let deletedProject: Project;
let otherTenantProject: Project;

let primaryTask: Task;
let deletedTask: Task;
let otherTenantTask: Task;
let activeSubtask: Task;
let deletedSubtask: Task;

const createUser = async (
  organizationId: string,
  role: Role,
  label: string,
): Promise<User> => {
  return prisma.user.create({
    data: {
      organizationId,
      firstName: label,
      lastName: 'User',
      email:
        `${label.toLowerCase()}-${randomUUID()}@example.com`,
      password: 'ai-security-test-password-hash',
      role,
      emailVerified: true,
      isActive: true,
    },
  });
};

const createProject = async ({
  organizationId,
  ownerId,
  name,
  deletedAt,
}: {
  organizationId: string;
  ownerId: string;
  name: string;
  deletedAt?: Date;
}): Promise<Project> => {
  return prisma.project.create({
    data: {
      organizationId,
      ownerId,
      name,
      key: `AI-${randomUUID()}`,
      description: `${name} description`,
      deletedAt,
    },
  });
};

const createTask = async ({
  organizationId,
  projectId,
  reporterId,
  title,
  parentTaskId,
  deletedAt,
}: {
  organizationId: string;
  projectId: string;
  reporterId: string;
  title: string;
  parentTaskId?: string;
  deletedAt?: Date;
}): Promise<Task> => {
  return prisma.task.create({
    data: {
      organizationId,
      projectId,
      reporterId,
      title,
      description: `${title} description`,
      parentTaskId,
      position: 1,
      deletedAt,
    },
  });
};

const tokenFor = (user: User): string => {
  return signAccessToken({
    userId: user.id,
    organizationId: user.organizationId,
  });
};

const sendRequest = async ({
  method,
  path,
  actor,
  body,
}: {
  method: 'GET' | 'POST';
  path: string;
  actor?: User;
  body?: unknown;
}): Promise<TestResponse> => {
  const headers: Record<string, string> = {};

  if (actor) {
    headers.Authorization =
      `Bearer ${tokenFor(actor)}`;
  }

  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(
    `${baseUrl}${path}`,
    {
      method,
      headers,
      body:
        body === undefined
          ? undefined
          : JSON.stringify(body),
    },
  );

  const responseText = await response.text();

  return {
    status: response.status,
    body: responseText
      ? JSON.parse(responseText) as JsonResponse
      : null,
  };
};

const cleanupTestData =
  async (): Promise<void> => {
    const organizationIds = [
      primaryOrganizationId,
      otherOrganizationId,
    ].filter(Boolean);

    if (organizationIds.length === 0) {
      return;
    }

    const organizationFilter = {
      organizationId: {
        in: organizationIds,
      },
    };

    await prisma.aIUsageLog.deleteMany({
      where: organizationFilter,
    });

    await prisma.task.deleteMany({
      where: organizationFilter,
    });

    await prisma.project.deleteMany({
      where: organizationFilter,
    });

    await prisma.refreshToken.deleteMany({
      where: {
        user: organizationFilter,
      },
    });

    await prisma.user.deleteMany({
      where: {
        organizationId: {
          in: organizationIds,
        },
      },
    });

    await prisma.organization.deleteMany({
      where: {
        id: {
          in: organizationIds,
        },
      },
    });

    primaryOrganizationId = '';
    otherOrganizationId = '';
  };

beforeAll(async () => {
  server = app.listen(0);

  await new Promise<void>((resolve) => {
    server.once('listening', resolve);
  });

  const address =
    server.address() as AddressInfo;

  baseUrl =
    `http://127.0.0.1:${address.port}`;
});

beforeEach(async () => {
  await cleanupTestData();

  const primaryOrganization =
    await prisma.organization.create({
      data: {
        name: 'AI Security Primary Organization',
        slug:
          `ai-security-primary-${randomUUID()}`,
      },
    });

  const otherOrganization =
    await prisma.organization.create({
      data: {
        name: 'AI Security Other Organization',
        slug:
          `ai-security-other-${randomUUID()}`,
      },
    });

  primaryOrganizationId =
    primaryOrganization.id;

  otherOrganizationId =
    otherOrganization.id;

  [
    primaryAdmin,
    primaryEmployee,
    otherTenantAdmin,
  ] = await Promise.all([
    createUser(
      primaryOrganizationId,
      Role.ADMIN,
      'PrimaryAdmin',
    ),
    createUser(
      primaryOrganizationId,
      Role.EMPLOYEE,
      'PrimaryEmployee',
    ),
    createUser(
      otherOrganizationId,
      Role.ADMIN,
      'OtherTenantAdmin',
    ),
  ]);

  [
    primaryProject,
    deletedProject,
    otherTenantProject,
  ] = await Promise.all([
    createProject({
      organizationId:
        primaryOrganizationId,
      ownerId: primaryAdmin.id,
      name: 'Primary AI Project',
    }),
    createProject({
      organizationId:
        primaryOrganizationId,
      ownerId: primaryAdmin.id,
      name: 'Deleted AI Project',
      deletedAt: new Date(),
    }),
    createProject({
      organizationId:
        otherOrganizationId,
      ownerId: otherTenantAdmin.id,
      name: 'Other Tenant AI Project',
    }),
  ]);

  [
    primaryTask,
    deletedTask,
    otherTenantTask,
  ] = await Promise.all([
    createTask({
      organizationId:
        primaryOrganizationId,
      projectId: primaryProject.id,
      reporterId: primaryAdmin.id,
      title: 'Primary AI Task',
    }),
    createTask({
      organizationId:
        primaryOrganizationId,
      projectId: primaryProject.id,
      reporterId: primaryAdmin.id,
      title: 'Deleted AI Task',
      deletedAt: new Date(),
    }),
    createTask({
      organizationId:
        otherOrganizationId,
      projectId: otherTenantProject.id,
      reporterId: otherTenantAdmin.id,
      title: 'Other Tenant AI Task',
    }),
  ]);

  [
    activeSubtask,
    deletedSubtask,
  ] = await Promise.all([
    createTask({
      organizationId:
        primaryOrganizationId,
      projectId: primaryProject.id,
      reporterId: primaryAdmin.id,
      parentTaskId: primaryTask.id,
      title: 'Active AI Subtask',
    }),
    createTask({
      organizationId:
        primaryOrganizationId,
      projectId: primaryProject.id,
      reporterId: primaryAdmin.id,
      parentTaskId: primaryTask.id,
      title: 'Deleted AI Subtask',
      deletedAt: new Date(),
    }),
  ]);
});

afterAll(async () => {
  await cleanupTestData();

  await new Promise<void>(
    (resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });

      server.closeAllConnections();
    },
  );

  await Promise.all(
    allQueues.map((queue) => queue.close()),
  );

  await closeRedisClient();
  await prisma.$disconnect();
});

describe('AI route authentication and validation', () => {
  test('rejects unauthenticated requests', async () => {
    const response = await sendRequest({
      method: 'POST',
      path: '/api/v1/ai/assistant/ask',
      body: {
        query: 'Summarize my workspace',
        contextType: 'GLOBAL',
      },
    });

    expect(response.status).toBe(401);
  });

  test('allows an employee with AI permission', async () => {
    const response = await sendRequest({
      method: 'POST',
      path: '/api/v1/ai/assistant/ask',
      actor: primaryEmployee,
      body: {
        query: '  Summarize my workspace  ',
        contextType: 'GLOBAL',
      },
    });

    expect(response.status).toBe(202);
    expect(response.body?.data).toEqual(
      expect.objectContaining({
        jobId: expect.any(String),
        status: 'QUEUED',
        checkStatusUrl: expect.any(String),
      }),
    );
  });

  test('rejects an invalid task identifier', async () => {
    const response = await sendRequest({
      method: 'GET',
      path:
        '/api/v1/ai/tasks/not-a-uuid/summary',
      actor: primaryAdmin,
    });

    expect(response.status).toBe(400);
  });

  test('rejects a missing assistant query', async () => {
    const response = await sendRequest({
      method: 'POST',
      path: '/api/v1/ai/assistant/ask',
      actor: primaryAdmin,
      body: {
        contextType: 'GLOBAL',
      },
    });

    expect(response.status).toBe(400);
  });

  test('rejects unsupported context types', async () => {
    const response = await sendRequest({
      method: 'POST',
      path: '/api/v1/ai/assistant/ask',
      actor: primaryAdmin,
      body: {
        query: 'Summarize this client',
        contextType: 'CRM',
        entityId: randomUUID(),
      },
    });

    expect(response.status).toBe(400);
  });

  test('requires an entity for task context', async () => {
    const response = await sendRequest({
      method: 'POST',
      path: '/api/v1/ai/assistant/ask',
      actor: primaryAdmin,
      body: {
        query: 'Summarize this task',
        contextType: 'TASK',
      },
    });

    expect(response.status).toBe(400);
  });

  test('rejects an entity for global context', async () => {
    const response = await sendRequest({
      method: 'POST',
      path: '/api/v1/ai/assistant/ask',
      actor: primaryAdmin,
      body: {
        query: 'Summarize my workspace',
        contextType: 'GLOBAL',
        entityId: primaryTask.id,
      },
    });

    expect(response.status).toBe(400);
  });

  test('rejects unknown request fields', async () => {
    const response = await sendRequest({
      method: 'POST',
      path: '/api/v1/ai/assistant/ask',
      actor: primaryAdmin,
      body: {
        query: 'Summarize my workspace',
        contextType: 'GLOBAL',
        organizationId:
          otherOrganizationId,
      },
    });

    expect(response.status).toBe(400);
  });
});

describe('AI context tenant isolation', () => {
  test('summarizes an active task in the caller tenant', async () => {
    const response = await sendRequest({
      method: 'GET',
      path:
        `/api/v1/ai/tasks/${primaryTask.id}/summary`,
      actor: primaryAdmin,
    });

    expect(response.status).toBe(202);
    expect(response.body?.data).toEqual(
      expect.objectContaining({
        jobId: expect.any(String),
        status: 'QUEUED',
        checkStatusUrl: expect.any(String),
      }),
    );
  });

  test('hides a task from another tenant', async () => {
    const response = await sendRequest({
      method: 'GET',
      path:
        `/api/v1/ai/tasks/${otherTenantTask.id}/summary`,
      actor: primaryAdmin,
    });

    expect(response.status).toBe(404);

    expect(
      await prisma.aIUsageLog.count({
        where: {
          organizationId:
            primaryOrganizationId,
          userId: primaryAdmin.id,
        },
      }),
    ).toBe(0);
  });

  test('hides a soft-deleted task', async () => {
    const response = await sendRequest({
      method: 'GET',
      path:
        `/api/v1/ai/tasks/${deletedTask.id}/summary`,
      actor: primaryAdmin,
    });

    expect(response.status).toBe(404);
  });

  test('hides a soft-deleted project', async () => {
    const response = await sendRequest({
      method: 'POST',
      path: '/api/v1/ai/assistant/ask',
      actor: primaryAdmin,
      body: {
        query: 'Summarize this project',
        contextType: 'PROJECT',
        entityId: deletedProject.id,
      },
    });

    expect(response.status).toBe(404);
  });

  test('hides a project from another tenant', async () => {
    const response = await sendRequest({
      method: 'POST',
      path: '/api/v1/ai/assistant/ask',
      actor: primaryAdmin,
      body: {
        query: 'Summarize this project',
        contextType: 'PROJECT',
        entityId: otherTenantProject.id,
      },
    });

    expect(response.status).toBe(404);
  });
});

describe('AI prompt context filtering', () => {
  test('counts only active subtasks', async () => {
    const context =
      await ContextBuilder.buildTaskContext(
        primaryOrganizationId,
        primaryTask.id,
      );

    expect(context).toContain(
      'Title: Primary AI Task',
    );

    expect(context).toContain(
      'Subtasks Count: 1',
    );

    expect(activeSubtask.deletedAt).toBeNull();
    expect(deletedSubtask.deletedAt).not.toBeNull();
  });

  test('includes only active project tasks', async () => {
    const context =
      await ContextBuilder.buildProjectContext(
        primaryOrganizationId,
        primaryProject.id,
      );

    expect(context).toContain(
      'Primary AI Task',
    );

    expect(context).toContain(
      'Active AI Subtask',
    );

    expect(context).not.toContain(
      'Deleted AI Task',
    );

    expect(context).not.toContain(
      'Deleted AI Subtask',
    );

    expect(context).not.toContain(
      'Other Tenant AI Task',
    );
  });
});
