import { aiProcessor } from '../ai.processor';
import { AIService } from '../../../ai/services/ai.service';
import { ContextBuilder } from '../../../ai/context/context.builder';
import { RealtimeService } from '../../../realtime/realtime.service';

jest.mock('../../../ai/services/ai.service', () => ({
  AIService: jest.fn().mockImplementation(() => ({
    generateCompletion: jest.fn(),
  })),
}));

jest.mock('../../../ai/context/context.builder', () => ({
  ContextBuilder: {
    buildTaskContext: jest.fn(),
    buildProjectContext: jest.fn(),
  },
}));

jest.mock('../../../realtime/realtime.service', () => ({
  RealtimeService: jest.fn().mockImplementation(() => ({
    emitToUser: jest.fn(),
  })),
}));

jest.mock('../../../../core/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

/*
 * AI worker (BullMQ) tests (ledger #29) — deterministic, DB-free. The
 * async AI path is security-sensitive: it guards tenant context, maps
 * features, threads the job id as correlation id, and emits the answer
 * ONLY to the asking user's room (the tenant-wide leak fix).
 */

const buildJob = (overrides: Record<string, unknown> = {}) => {
  const { data, ...rest } = overrides;
  return {
    id: 'job-42',
    name: 'AI_GENERATE_COMPLETION',
    data: {
      organizationId: 'org-1',
      userId: 'user-1',
      taskType: 'TASK_SUMMARY',
      entityId: 'task-1',
      ...((data as object) ?? {}),
    },
    ...rest,
  };
};

const completionResponse = {
  text: 'Generated answer',
  usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
  provider: 'mock',
  model: 'mock-model-v1',
};

beforeEach(() => {
  jest.clearAllMocks();
  (AIService as unknown as jest.Mock).mockImplementation(() => ({
    generateCompletion: jest.fn().mockResolvedValue(completionResponse),
  }));
  (RealtimeService as unknown as jest.Mock).mockImplementation(() => ({
    emitToUser: jest.fn(),
  }));
  (ContextBuilder.buildTaskContext as jest.Mock).mockResolvedValue('task context');
  (ContextBuilder.buildProjectContext as jest.Mock).mockResolvedValue('project context');
});

describe('aiProcessor', () => {
  it('throws when tenant context is missing (security guard)', async () => {
    await expect(
      aiProcessor(buildJob({ data: { organizationId: '', userId: 'user-1' } }) as any),
    ).rejects.toThrow(/Tenant context .* missing/);

    await expect(
      aiProcessor(buildJob({ data: { organizationId: 'org-1', userId: '' } }) as any),
    ).rejects.toThrow(/Tenant context .* missing/);
  });

  it('handles TASK_SUMMARY: builds task context, tags feature, threads job id', async () => {
    const result = await aiProcessor(buildJob() as any);

    expect(ContextBuilder.buildTaskContext).toHaveBeenCalledWith('org-1', 'task-1');
    const aiService = (AIService as unknown as jest.Mock).mock.results[0].value;
    expect(aiService.generateCompletion).toHaveBeenCalledWith(
      'org-1',
      'user-1',
      'TASK_SUMMARY',
      expect.objectContaining({
        systemPrompt: expect.any(String),
        prompt: expect.stringContaining('task context'),
      }),
      'job-42', // correlation id = job id
    );
    expect(result).toEqual({ success: true, jobId: 'job-42', result: 'Generated answer' });
  });

  it('handles PROJECT_SUMMARY context: builds project context and tags feature', async () => {
    await aiProcessor(
      buildJob({
        data: { taskType: 'WORKSPACE_ASSISTANT', contextType: 'PROJECT', entityId: 'proj-9' },
      }) as any,
    );

    expect(ContextBuilder.buildProjectContext).toHaveBeenCalledWith('org-1', 'proj-9');
    const aiService = (AIService as unknown as jest.Mock).mock.results[0].value;
    expect(aiService.generateCompletion).toHaveBeenCalledWith(
      'org-1',
      'user-1',
      'PROJECT_SUMMARY',
      expect.anything(),
      'job-42',
    );
  });

  it('handles WORKSPACE_ASSISTANT with a query prompt and GLOBAL context', async () => {
    await aiProcessor(
      buildJob({
        data: { taskType: 'WORKSPACE_ASSISTANT', contextType: 'GLOBAL', query: 'Summarize my workspace' },
      }) as any,
    );

    const aiService = (AIService as unknown as jest.Mock).mock.results[0].value;
    const call = aiService.generateCompletion.mock.calls[0];
    expect(call[2]).toBe('WORKSPACE_ASSISTANT');
    expect(call[3].prompt).toContain('Summarize my workspace');
    expect(call[3].prompt).toContain('General Workspace Context');
  });

  it('emits the answer ONLY to the asking user room (tenant isolation fix)', async () => {
    await aiProcessor(buildJob() as any);

    const realtime = (RealtimeService as unknown as jest.Mock).mock.results[0].value;
    expect(realtime.emitToUser).toHaveBeenCalledTimes(1);
    const [targetRoom, event, payload] = realtime.emitToUser.mock.calls[0];
    expect(targetRoom).toBe('user-1'); // NOT the organization room
    expect(event).toBe('ai.completion.finished');
    expect(payload).toEqual(
      expect.objectContaining({
        jobId: 'job-42',
        userId: 'user-1',
        featureTag: 'TASK_SUMMARY',
        result: 'Generated answer',
      }),
    );
  });

  it('never emits to an organization-wide room', async () => {
    await aiProcessor(buildJob() as any);

    const realtime = (RealtimeService as unknown as jest.Mock).mock.results[0].value;
    const allTargets = realtime.emitToUser.mock.calls.map((c: unknown[]) => c[0]);
    expect(allTargets.every((t: unknown) => t === 'user-1')).toBe(true);
    expect(allTargets.some((t: unknown) => t === 'org-1' || t === `org:org-1`)).toBe(false);
  });
});
