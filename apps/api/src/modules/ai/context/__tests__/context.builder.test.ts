import { ContextBuilder } from '../context.builder';
import { prisma } from '../../../../config/prisma';

jest.mock('../../../../config/prisma', () => ({
  prisma: {
    task: { findFirst: jest.fn() },
    project: { findFirst: jest.fn() },
  },
}));

/*
 * ContextBuilder tests (ledger #31) — deterministic, DB-free. The AI
 * prompt-context assembly is security-sensitive: it must be tenant-
 * scoped (organizationId in every query), fail closed on missing org,
 * and 404 on cross-tenant/missing rows — the context fed to the LLM
 * must never leak another tenant's data.
 */

const taskFindFirstMock = prisma.task.findFirst as jest.Mock;
const projectFindFirstMock = prisma.project.findFirst as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('buildTaskContext', () => {
  it('throws 400 when organization context is missing', async () => {
    await expect(ContextBuilder.buildTaskContext('', 'task-1')).rejects.toMatchObject({
      message: 'Organization context is required',
      statusCode: 400,
    });
    expect(taskFindFirstMock).not.toHaveBeenCalled();
  });

  it('queries tenant-scoped (organizationId + non-deleted filters)', async () => {
    taskFindFirstMock.mockResolvedValue({
      id: 'task-1',
      title: 'Fix bug',
      status: 'IN_PROGRESS',
      priority: 'HIGH',
      description: 'Repro steps',
      assignee: { firstName: 'Ada', lastName: 'Lovelace', deletedAt: null, isActive: true },
      project: { name: 'Core' },
      subtasks: [{ id: 'st-1' }, { id: 'st-2' }],
    });

    const context = await ContextBuilder.buildTaskContext('org-1', 'task-1');

    const { where, select } = taskFindFirstMock.mock.calls[0][0];
    expect(where).toMatchObject({ id: 'task-1', organizationId: 'org-1', deletedAt: null });
    expect(where.project).toMatchObject({ organizationId: 'org-1', deletedAt: null });
    // The subtasks tenant filter lives in the select shape.
    expect(select.subtasks.where).toMatchObject({ organizationId: 'org-1', deletedAt: null });
    expect(context).toContain('[TASK CONTEXT]');
    expect(context).toContain('Title: Fix bug');
    expect(context).toContain('Assignee: Ada Lovelace');
    expect(context).toContain('Subtasks Count: 2');
  });

  it('throws 404 for a missing or cross-tenant task', async () => {
    taskFindFirstMock.mockResolvedValue(null);
    await expect(ContextBuilder.buildTaskContext('org-1', 'task-other-tenant')).rejects.toMatchObject({
      message: 'Task not found',
      statusCode: 404,
    });
  });

  it('labels an inactive or deleted assignee as Unassigned', async () => {
    taskFindFirstMock.mockResolvedValue({
      id: 'task-1',
      title: 'T',
      status: 'TODO',
      priority: 'LOW',
      description: null,
      assignee: { firstName: 'Ghost', lastName: 'User', deletedAt: new Date(), isActive: false },
      project: { name: 'P' },
      subtasks: [],
    });

    const context = await ContextBuilder.buildTaskContext('org-1', 'task-1');
    expect(context).toContain('Assignee: Unassigned');
    expect(context).toContain('Description: None');
  });
});

describe('buildProjectContext', () => {
  it('throws 400 when organization context is missing', async () => {
    await expect(ContextBuilder.buildProjectContext('', 'proj-1')).rejects.toMatchObject({
      message: 'Organization context is required',
      statusCode: 400,
    });
    expect(projectFindFirstMock).not.toHaveBeenCalled();
  });

  it('queries tenant-scoped and formats the task summary', async () => {
    projectFindFirstMock.mockResolvedValue({
      id: 'proj-1',
      name: 'Launch',
      status: 'ACTIVE',
      description: 'Ship it',
      tasks: [
        { title: 'A', status: 'DONE', priority: 'HIGH' },
        { title: 'B', status: 'TODO', priority: 'LOW' },
      ],
    });

    const context = await ContextBuilder.buildProjectContext('org-1', 'proj-1');

    const { where, select } = projectFindFirstMock.mock.calls[0][0];
    expect(where).toMatchObject({ id: 'proj-1', organizationId: 'org-1', deletedAt: null });
    // The tasks tenant filter lives in the select shape.
    expect(select.tasks.where).toMatchObject({ organizationId: 'org-1', deletedAt: null });
    expect(context).toContain('[PROJECT CONTEXT]');
    expect(context).toContain('- [DONE] A (HIGH)');
    expect(context).toContain('- [TODO] B (LOW)');
  });

  it('throws 404 for a missing or cross-tenant project', async () => {
    projectFindFirstMock.mockResolvedValue(null);
    await expect(ContextBuilder.buildProjectContext('org-1', 'proj-other')).rejects.toMatchObject({
      message: 'Project not found',
      statusCode: 404,
    });
  });

  it('renders a friendly empty-task message', async () => {
    projectFindFirstMock.mockResolvedValue({
      id: 'proj-1',
      name: 'Empty',
      status: 'DRAFT',
      description: null,
      tasks: [],
    });

    const context = await ContextBuilder.buildProjectContext('org-1', 'proj-1');
    expect(context).toContain('No tasks assigned.');
  });
});
