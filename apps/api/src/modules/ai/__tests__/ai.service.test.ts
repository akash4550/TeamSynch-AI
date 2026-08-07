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

jest.mock('../../../config/prisma', () => ({
  prisma: {
    aIUsageLog: {
      create: jest.fn(),
    },
  },
}));

describe('AIService', () => {
  let providerMock: jest.Mocked<AIProvider>;
  let usageCreateMock: jest.Mock;
  let service: AIService;

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
        latencyMs: expect.any(Number),
        success: false,
        errorMessage: 'AI provider request failed',
      },
    });
  });
  it('logs safe provider metadata on failures', async () => {
    const providerError = new AIProviderError(
      'AI provider rate limit exceeded',
      {
        provider: 'mock',
        model: 'provider-model-v1',
        statusCode: 429,
        requestId: 'provider-request-123',
        providerCode: 'rate_limit',
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
        requestId: 'provider-request-123',
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        latencyMs: expect.any(Number),
        success: false,
        errorMessage:
          'AI provider rate limit exceeded',
      },
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
});