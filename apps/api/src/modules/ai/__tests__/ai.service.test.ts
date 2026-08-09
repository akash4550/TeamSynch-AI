import {
  AIProvider as PrismaAIProvider,
} from '@prisma/client';
import { AIProviderError } from '../providers/ai-provider.error';
import { prisma } from '../../../config/prisma';
import {
  AICompletionResponse,
  AIProvider,
} from '../providers/ai-provider.interface';
import { AIService } from '../services/ai.service';
import { logger } from '../../../core/utils/logger';
import {
  recordAIError,
  recordAIRequest,
  recordAIRequestDurationSeconds,
  recordAITokens,
  recordAICostUsd,
} from '../../../core/metrics/aiMetrics';

jest.mock('../../../config/prisma', () => ({
  prisma: {
    aIUsageLog: {
      create: jest.fn(),
    },
  },
}));

jest.mock('../../../core/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('../../../core/metrics/aiMetrics', () => ({
  recordAIRequest: jest.fn(),
  recordAIRequestDurationSeconds: jest.fn(),
  recordAITokens: jest.fn(),
  recordAIError: jest.fn(),
  recordAICostUsd: jest.fn(),
}));

describe('AIService', () => {
  let providerMock: jest.Mocked<AIProvider>;
  let usageCreateMock: jest.Mock;
  let service: AIService;

  const recordAIRequestMock = recordAIRequest as jest.Mock;
  const recordAIDurationMock = recordAIRequestDurationSeconds as jest.Mock;
  const recordAITokensMock = recordAITokens as jest.Mock;
  const recordAICostMock = recordAICostUsd as jest.Mock;
  const recordAIErrorMock = recordAIError as jest.Mock;
  const loggerInfoMock = logger.info as jest.Mock;
  const loggerWarnMock = logger.warn as jest.Mock;

  const completionResponse:
    AICompletionResponse = {
      text: 'Generated response',
      usage: {
        promptTokens: 10,
        completionTokens: 5,
        totalTokens: 15,
      },
      provider: 'mock',
      model: 'mock-model-v1',
    };

  beforeEach(() => {
    jest.clearAllMocks();

    // TOOLCHAIN REPIN (ledger #13 — 2026-08-05): ledger #9 added
    // generateEmbedding to the AIProvider contract (real RAG embeddings).
    // The two literal mocks below now implement the full interface.
    providerMock = {
      name: 'mock',
      generateCompletion: jest.fn(),
      generateEmbedding: jest.fn(),
    };

    usageCreateMock =
      prisma.aIUsageLog.create as jest.Mock;

    service = new AIService(providerMock);
  });

  it('normalizes the request and logs successful usage', async () => {
    providerMock.generateCompletion.mockResolvedValue(
      completionResponse,
    );

    usageCreateMock.mockResolvedValue({});

    const result =
      await service.generateCompletion(
        'organization-1',
        'user-1',
        '  TASK_SUMMARY  ',
        {
          prompt: '  Summarize this task  ',
          systemPrompt:
            '  You are an assistant  ',
        },
      );

    expect(
      providerMock.generateCompletion,
    ).toHaveBeenCalledWith({
      prompt: 'Summarize this task',
      systemPrompt: 'You are an assistant',
    });

    expect(usageCreateMock).toHaveBeenCalledWith({
      data: {
        organizationId: 'organization-1',
        userId: 'user-1',
        feature: 'TASK_SUMMARY',
        provider: PrismaAIProvider.MOCK,
        model: 'mock-model-v1',
        promptTokens: 10,
        completionTokens: 5,
        totalTokens: 15,
        cost: 0, // MOCK provider: no real usage -> no fabricated cost
        latencyMs: expect.any(Number),
        success: true,
        errorMessage: undefined,
      },
    });

    expect(result).toEqual(completionResponse);
  });

  it('removes an empty optional system prompt', async () => {
    providerMock.generateCompletion.mockResolvedValue(
      completionResponse,
    );

    usageCreateMock.mockResolvedValue({});

    await service.generateCompletion(
      'organization-1',
      'user-1',
      'WORKSPACE_ASSISTANT',
      {
        prompt: 'Question',
        systemPrompt: '   ',
      },
    );

    expect(
      providerMock.generateCompletion,
    ).toHaveBeenCalledWith({
      prompt: 'Question',
      systemPrompt: undefined,
    });
  });

  it('logs provider failures before rethrowing them', async () => {
    const providerError =
      new Error('Provider unavailable');

    providerMock.generateCompletion.mockRejectedValue(
      providerError,
    );

    usageCreateMock.mockResolvedValue({});

    await expect(
      service.generateCompletion(
        'organization-1',
        'user-1',
        'WORKSPACE_ASSISTANT',
        {
          prompt: 'Question',
        },
      ),
    ).rejects.toMatchObject({
  name: 'AIProviderError',
  message: 'AI provider request failed',
  statusCode: 502,
});

    expect(usageCreateMock).toHaveBeenCalledWith({
      data: {
        organizationId: 'organization-1',
        userId: 'user-1',
        feature: 'WORKSPACE_ASSISTANT',
        provider: PrismaAIProvider.MOCK,
        model: 'unknown',
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        cost: 0,
        latencyMs: expect.any(Number),
        success: false,
        errorMessage: 'AI provider request failed',
      },
    });
  });
  it('logs safe provider metadata on failures (provider request id stays in the structured log)', async () => {
    const providerError = new AIProviderError(
      'AI provider rate limit exceeded',
      {
        provider: 'mock',
        model: 'provider-model-v1',
        statusCode: 429,
        requestId: 'provider-request-123',
        providerCode: 'rate_limit',
        retryCount: 2,
        retryAfterSeconds: 30,
      },
    );

    providerMock.generateCompletion.mockRejectedValue(
      providerError,
    );
    usageCreateMock.mockResolvedValue({});

    await expect(
      service.generateCompletion(
        'organization-1',
        'user-1',
        'WORKSPACE_ASSISTANT',
        {
          prompt: 'Question',
        },
      ),
    ).rejects.toBe(providerError);

    expect(usageCreateMock).toHaveBeenCalledWith({
      data: {
        organizationId: 'organization-1',
        userId: 'user-1',
        feature: 'WORKSPACE_ASSISTANT',
        provider: PrismaAIProvider.MOCK,
        model: 'provider-model-v1',
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        cost: 0,
        latencyMs: expect.any(Number),
        success: false,
        errorMessage:
          'AI provider rate limit exceeded',
      },
    });

    // The upstream provider request id is NOT persisted into
    // AIUsageLog.requestId (that field is reserved for the TeamSynch
    // correlation id); it surfaces in the structured failure log instead.
    expect(loggerWarnMock).toHaveBeenCalledWith(
      'ai.call.failed',
      expect.objectContaining({
        event: 'ai.call.failed',
        kind: 'completion',
        providerCode: 'rate_limit',
        providerRequestId: 'provider-request-123',
        retryCount: 2,
        retryAfterSeconds: 30,
      }),
    );
    expect(recordAIErrorMock).toHaveBeenCalledWith(
      'WORKSPACE_ASSISTANT',
      PrismaAIProvider.MOCK,
      'rate_limit',
    );
    expect(recordAIRequestMock).toHaveBeenCalledWith({
      feature: 'WORKSPACE_ASSISTANT',
      provider: PrismaAIProvider.MOCK,
      kind: 'completion',
      result: 'failure',
    });
  });

  it('does not misclassify a logging failure as a provider failure', async () => {
    const loggingError =
      new Error('Usage log unavailable');

    providerMock.generateCompletion.mockResolvedValue(
      completionResponse,
    );

    usageCreateMock.mockRejectedValue(loggingError);

    await expect(
      service.generateCompletion(
        'organization-1',
        'user-1',
        'TASK_SUMMARY',
        {
          prompt: 'Summarize',
        },
      ),
    ).rejects.toBe(loggingError);

    expect(
      providerMock.generateCompletion,
    ).toHaveBeenCalledTimes(1);

    expect(usageCreateMock).toHaveBeenCalledTimes(1);
  });

  it('rejects a missing organization context', async () => {
    await expect(
      service.generateCompletion(
        '',
        'user-1',
        'TASK_SUMMARY',
        {
          prompt: 'Summarize',
        },
      ),
    ).rejects.toMatchObject({
      message:
        'Organization context is required for AI usage',
      statusCode: 400,
    });

    expect(
      providerMock.generateCompletion,
    ).not.toHaveBeenCalled();

    expect(usageCreateMock).not.toHaveBeenCalled();
  });

  it('rejects a missing user context', async () => {
    await expect(
      service.generateCompletion(
        'organization-1',
        '',
        'TASK_SUMMARY',
        {
          prompt: 'Summarize',
        },
      ),
    ).rejects.toMatchObject({
      message:
        'User context is required for AI usage',
      statusCode: 400,
    });

    expect(
      providerMock.generateCompletion,
    ).not.toHaveBeenCalled();

    expect(usageCreateMock).not.toHaveBeenCalled();
  });

  it('rejects an empty feature', async () => {
    await expect(
      service.generateCompletion(
        'organization-1',
        'user-1',
        '   ',
        {
          prompt: 'Summarize',
        },
      ),
    ).rejects.toMatchObject({
      message: 'AI feature is required',
      statusCode: 400,
    });

    expect(
      providerMock.generateCompletion,
    ).not.toHaveBeenCalled();

    expect(usageCreateMock).not.toHaveBeenCalled();
  });

  it('rejects an empty prompt', async () => {
    await expect(
      service.generateCompletion(
        'organization-1',
        'user-1',
        'TASK_SUMMARY',
        {
          prompt: '   ',
        },
      ),
    ).rejects.toMatchObject({
      message: 'AI prompt is required',
      statusCode: 400,
    });

    expect(
      providerMock.generateCompletion,
    ).not.toHaveBeenCalled();

    expect(usageCreateMock).not.toHaveBeenCalled();
  });

  it('rejects an unsupported provider before generation', async () => {
    providerMock = {
      name: 'unsupported-provider',
      generateCompletion: jest.fn(),
      generateEmbedding: jest.fn(),
    };

    service = new AIService(providerMock);

    await expect(
      service.generateCompletion(
        'organization-1',
        'user-1',
        'TASK_SUMMARY',
        {
          prompt: 'Summarize',
        },
      ),
    ).rejects.toMatchObject({
      message:
        'Unsupported AI provider: unsupported-provider',
      statusCode: 500,
    });

    expect(
      providerMock.generateCompletion,
    ).not.toHaveBeenCalled();

    expect(usageCreateMock).not.toHaveBeenCalled();
  });

  it('persists the application correlation id as AIUsageLog.requestId on success', async () => {
    providerMock.generateCompletion.mockResolvedValue(completionResponse);
    usageCreateMock.mockResolvedValue({});

    await service.generateCompletion(
      'organization-1',
      'user-1',
      'TASK_SUMMARY',
      { prompt: 'Summarize this task' },
      'corr-http-42',
    );

    expect(usageCreateMock.mock.calls[0][0].data.requestId).toBe('corr-http-42');
    expect(usageCreateMock.mock.calls[0][0].data.success).toBe(true);
  });

  it('records completion success metrics and a structured success log', async () => {
    providerMock.generateCompletion.mockResolvedValue(completionResponse);
    usageCreateMock.mockResolvedValue({});
    const labels = { feature: 'TASK_SUMMARY', provider: PrismaAIProvider.MOCK, kind: 'completion' };

    await service.generateCompletion(
      'organization-1',
      'user-1',
      'TASK_SUMMARY',
      { prompt: 'Summarize this task' },
      'corr-1',
    );

    expect(recordAIRequestMock).toHaveBeenCalledWith({ ...labels, result: 'success' });
    expect(recordAIDurationMock).toHaveBeenCalledWith(labels, expect.any(Number));
    // Provider-reported token totals, split by token type.
    expect(recordAITokensMock).toHaveBeenCalledWith({ ...labels, tokenType: 'prompt' }, 10);
    expect(recordAITokensMock).toHaveBeenCalledWith({ ...labels, tokenType: 'completion' }, 5);
    expect(recordAITokensMock).toHaveBeenCalledWith({ ...labels, tokenType: 'total' }, 15);
    expect(loggerInfoMock).toHaveBeenCalledWith(
      'ai.call.completed',
      expect.objectContaining({
        event: 'ai.call.completed',
        correlationId: 'corr-1',
        feature: 'TASK_SUMMARY',
        provider: PrismaAIProvider.MOCK,
        model: 'mock-model-v1',
        kind: 'completion',
        latencyMs: expect.any(Number),
        tokens: { prompt: 10, completion: 5, total: 15 },
      }),
    );
  });

  it('records completion failure metrics, correlation id, and provider diagnostics', async () => {
    const providerError = new AIProviderError('AI provider rate limit exceeded', {
      provider: 'mock',
      model: 'provider-model-v1',
      statusCode: 429,
      requestId: 'provider-request-123',
      providerCode: 'rate_limit',
    });
    providerMock.generateCompletion.mockRejectedValue(providerError);
    usageCreateMock.mockResolvedValue({});

    await expect(
      service.generateCompletion(
        'organization-1',
        'user-1',
        'WORKSPACE_ASSISTANT',
        { prompt: 'Question' },
        'corr-2',
      ),
    ).rejects.toBe(providerError);

    const labels = { feature: 'WORKSPACE_ASSISTANT', provider: PrismaAIProvider.MOCK, kind: 'completion' };
    expect(recordAIRequestMock).toHaveBeenCalledWith({ ...labels, result: 'failure' });
    expect(recordAIDurationMock).toHaveBeenCalledWith(labels, expect.any(Number));
    expect(recordAIErrorMock).toHaveBeenCalledWith('WORKSPACE_ASSISTANT', PrismaAIProvider.MOCK, 'rate_limit');
    expect(loggerWarnMock).toHaveBeenCalledWith(
      'ai.call.failed',
      expect.objectContaining({
        event: 'ai.call.failed',
        correlationId: 'corr-2',
        kind: 'completion',
        providerCode: 'rate_limit',
        providerRequestId: 'provider-request-123',
      }),
    );
    // TeamSynch correlation id persisted; provider id NOT persisted.
    expect(usageCreateMock.mock.calls[0][0].data.requestId).toBe('corr-2');
    expect(usageCreateMock.mock.calls[0][0].data.success).toBe(false);
  });

  it('records embedding success metrics, token total, and correlation id', async () => {
    providerMock.generateEmbedding.mockResolvedValue({
      embedding: [0.1, 0.2],
      model: 'text-embedding-3-small',
      usage: { totalTokens: 42 },
    });
    usageCreateMock.mockResolvedValue({});
    const labels = { feature: 'rag_query', provider: PrismaAIProvider.MOCK, kind: 'embedding' };

    const result = await service.generateEmbedding('chunk text', {
      organizationId: 'organization-1',
      userId: 'user-1',
      feature: 'rag_query',
      correlationId: 'corr-embed-1',
    });

    expect(result.totalTokens).toBe(42);
    expect(usageCreateMock.mock.calls[0][0].data.requestId).toBe('corr-embed-1');
    expect(usageCreateMock.mock.calls[0][0].data.success).toBe(true);
    expect(recordAIRequestMock).toHaveBeenCalledWith({ ...labels, result: 'success' });
    // Embeddings expose only a total; no prompt/completion split invented.
    expect(recordAITokensMock).toHaveBeenCalledWith({ ...labels, tokenType: 'total' }, 42);
    expect(loggerInfoMock).toHaveBeenCalledWith(
      'ai.call.completed',
      expect.objectContaining({
        event: 'ai.call.completed',
        correlationId: 'corr-embed-1',
        kind: 'embedding',
        model: 'text-embedding-3-small',
        tokens: { total: 42 },
      }),
    );
  });

  it('records embedding failure metrics and failure log with provider diagnostics', async () => {
    providerMock.generateEmbedding.mockRejectedValue(
      new AIProviderError('Embedding provider rate limited', {
        provider: 'mock',
        model: 'text-embedding-3-small',
        statusCode: 429,
        requestId: 'provider-embed-7',
        providerCode: 'rate_limit',
      }),
    );
    usageCreateMock.mockResolvedValue({});
    const labels = { feature: 'rag_query', provider: PrismaAIProvider.MOCK, kind: 'embedding' };

    await expect(
      service.generateEmbedding('chunk text', {
        organizationId: 'organization-1',
        userId: 'user-1',
        feature: 'rag_query',
        correlationId: 'corr-embed-2',
      }),
    ).rejects.toMatchObject({ statusCode: 429 });

    expect(recordAIRequestMock).toHaveBeenCalledWith({ ...labels, result: 'failure' });
    expect(recordAIErrorMock).toHaveBeenCalledWith('rag_query', PrismaAIProvider.MOCK, 'rate_limit');
    expect(loggerWarnMock).toHaveBeenCalledWith(
      'ai.call.failed',
      expect.objectContaining({
        event: 'ai.call.failed',
        correlationId: 'corr-embed-2',
        kind: 'embedding',
        providerCode: 'rate_limit',
        providerRequestId: 'provider-embed-7',
      }),
    );
    expect(usageCreateMock.mock.calls[0][0].data.requestId).toBe('corr-embed-2');
    expect(usageCreateMock.mock.calls[0][0].data.success).toBe(false);
  });

  it('never lets an observability failure break the AI call itself', async () => {
    providerMock.generateCompletion.mockResolvedValue(completionResponse);
    usageCreateMock.mockResolvedValue({});
    // Metrics-recording failure: the completion must still succeed.
    recordAIRequestMock.mockImplementation(() => {
      throw new Error('prometheus unavailable');
    });

    const result = await service.generateCompletion(
      'organization-1',
      'user-1',
      'TASK_SUMMARY',
      { prompt: 'Summarize this task' },
      'corr-safe-1',
    );

    expect(result).toEqual(completionResponse);
    expect(usageCreateMock).toHaveBeenCalledTimes(1);

    // Same guarantee on the failure path: observability failing must not
    // mask the original provider error.
    providerMock.generateCompletion.mockRejectedValue(
      new AIProviderError('provider down', {
        provider: 'mock',
        model: 'm',
        statusCode: 503,
      }),
    );

    await expect(
      service.generateCompletion(
        'organization-1',
        'user-1',
        'WORKSPACE_ASSISTANT',
        { prompt: 'Question' },
        'corr-safe-2',
      ),
    ).rejects.toMatchObject({ statusCode: 503 });
  });

  it('writes an estimated cost for real provider completions', async () => {
    // Neutralize implementations leaked by earlier tests (clearAllMocks
    // does not reset mock implementations).
    recordAIRequestMock.mockImplementation(() => undefined);
    providerMock.generateCompletion.mockResolvedValue({
      text: 'answer',
      usage: { promptTokens: 1_000_000, completionTokens: 1_000_000, totalTokens: 2_000_000 },
      provider: 'openai',
      model: 'gpt-4o-mini',
    });
    usageCreateMock.mockResolvedValue({});

    await service.generateCompletion(
      'organization-1',
      'user-1',
      'TASK_SUMMARY',
      { prompt: 'Summarize' },
    );

    expect(usageCreateMock.mock.calls[0][0].data.cost).toBeCloseTo(0.75, 6);
    // The same estimate is recorded as a Prometheus cost counter under
    // the CONFIGURED provider label (resolveProvider), with the cost
    // derived from the response's provider/model rates.
    expect(recordAICostMock).toHaveBeenCalledWith(
      { feature: 'TASK_SUMMARY', provider: PrismaAIProvider.MOCK, kind: 'completion' },
      expect.closeTo(0.75, 6),
    );
  });

  it('records no Prometheus cost for mock completions (estimate is 0)', async () => {
    recordAIRequestMock.mockImplementation(() => undefined);
    providerMock.generateCompletion.mockResolvedValue(completionResponse);
    usageCreateMock.mockResolvedValue({});

    await service.generateCompletion(
      'organization-1',
      'user-1',
      'TASK_SUMMARY',
      { prompt: 'Summarize' },
    );

    expect(recordAICostMock).toHaveBeenCalledWith(
      { feature: 'TASK_SUMMARY', provider: PrismaAIProvider.MOCK, kind: 'completion' },
      0,
    );
  });

  it('writes an estimated cost for real provider embeddings', async () => {
    // A dedicated provider whose instance name is OPENAI maps to real
    // rates; the default mock provider intentionally estimates 0.
    const openAiProviderMock: jest.Mocked<AIProvider> = {
      name: 'openai',
      generateCompletion: jest.fn(),
      generateEmbedding: jest.fn(),
    };
    openAiProviderMock.generateEmbedding.mockResolvedValue({
      embedding: [0.1],
      model: 'text-embedding-3-small',
      usage: { totalTokens: 1_000_000 },
    });
    const openAiService = new AIService(openAiProviderMock);
    usageCreateMock.mockResolvedValue({});

    await openAiService.generateEmbedding('chunk', {
      organizationId: 'organization-1',
      userId: 'user-1',
      feature: 'rag_ingest',
    });

    expect(usageCreateMock.mock.calls[0][0].data.cost).toBeCloseTo(0.02, 6);
  });

  it('records embeddings without tenant context under the unknown feature', async () => {
    providerMock.generateEmbedding.mockResolvedValue({
      embedding: [1],
      model: 'm',
      usage: { totalTokens: 7 },
    });

    await service.generateEmbedding('bare text');

    expect(recordAIRequestMock).toHaveBeenCalledWith({
      feature: 'unknown',
      provider: PrismaAIProvider.MOCK,
      kind: 'embedding',
      result: 'success',
    });
    // No tenant context -> no AIUsageLog row (existing contract preserved).
    expect(usageCreateMock).not.toHaveBeenCalled();
  });
});