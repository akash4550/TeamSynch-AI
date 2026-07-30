import OpenAI from 'openai';

import { OpenAIProvider } from '../providers/openai.provider';

const mockCreate = jest.fn();

jest.mock('openai', () => {
  const actual = jest.requireActual('openai');
  const ActualOpenAI = actual.default;

  const MockOpenAI = jest.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: (...args: unknown[]) =>
          mockCreate(...args),
      },
    },
  }));

  Object.assign(MockOpenAI, {
    APIError: ActualOpenAI.APIError,
    APIConnectionError: ActualOpenAI.APIConnectionError,
    APIConnectionTimeoutError:
      ActualOpenAI.APIConnectionTimeoutError,
    RateLimitError: ActualOpenAI.RateLimitError,
  });

  return {
    __esModule: true,
    ...actual,
    default: MockOpenAI,
  };
});

describe('OpenAIProvider', () => {
  beforeEach(() => {
    mockCreate.mockReset();
    (OpenAI as unknown as jest.Mock).mockClear();
  });

  it('maps the request and returns normalized usage', async () => {
    mockCreate.mockResolvedValue({
      choices: [
        {
          message: {
            content: 'Generated response',
          },
        },
      ],
      usage: {
        prompt_tokens: 8,
        completion_tokens: 4,
        total_tokens: 12,
      },
      model: 'returned-openai-model',
    });

    const provider = new OpenAIProvider({
      apiKey: 'test-openai-key',
      model: 'configured-openai-model',
      timeoutMs: 5000,
      maxOutputTokens: 100,
    });

    const response = await provider.generateCompletion({
      prompt: 'Hello',
      systemPrompt: 'Be helpful',
      maxTokens: 50,
      temperature: 0.2,
      stopSequences: ['END'],
    });

    expect(OpenAI).toHaveBeenCalledWith({
      apiKey: 'test-openai-key',
      timeout: 5000,
      maxRetries: 2,
      logLevel: 'off',
    });

    expect(mockCreate).toHaveBeenCalledWith({
      model: 'configured-openai-model',
      messages: [
        {
          role: 'system',
          content: 'Be helpful',
        },
        {
          role: 'user',
          content: 'Hello',
        },
      ],
      max_completion_tokens: 50,
      temperature: 0.2,
      stop: ['END'],
      store: false,
    });

    expect(response).toEqual({
      text: 'Generated response',
      usage: {
        promptTokens: 8,
        completionTokens: 4,
        totalTokens: 12,
      },
      provider: 'openai',
      model: 'returned-openai-model',
    });
  });

  it('uses safe defaults when optional response data is absent', async () => {
    mockCreate.mockResolvedValue({
      choices: [],
      model: 'returned-openai-model',
    });

    const provider = new OpenAIProvider({
      apiKey: 'test-openai-key',
      model: 'configured-openai-model',
      timeoutMs: 5000,
      maxOutputTokens: 100,
    });

    const response = await provider.generateCompletion({
      prompt: 'Hello',
    });

    expect(mockCreate).toHaveBeenCalledWith({
      model: 'configured-openai-model',
      messages: [
        {
          role: 'user',
          content: 'Hello',
        },
      ],
      max_completion_tokens: 100,
      temperature: undefined,
      stop: undefined,
      store: false,
    });

    expect(response).toEqual({
      text: '',
      usage: {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
      },
      provider: 'openai',
      model: 'returned-openai-model',
    });
  });
  it('normalizes timeout errors safely', async () => {
    const timeoutError = Object.create(
      OpenAI.APIConnectionTimeoutError.prototype,
    );

    mockCreate.mockRejectedValue(timeoutError);

    const provider = new OpenAIProvider({
      apiKey: 'test-openai-key',
      model: 'configured-openai-model',
      timeoutMs: 5000,
      maxOutputTokens: 100,
    });

    await expect(
      provider.generateCompletion({
        prompt: 'Hello',
      }),
    ).rejects.toMatchObject({
      name: 'AIProviderError',
      message: 'AI provider request timed out',
      statusCode: 504,
      provider: 'openai',
      model: 'configured-openai-model',
      providerCode: 'timeout',
    });
  });
  it('normalizes unknown errors safely', async () => {
    mockCreate.mockRejectedValue(
      new Error('Sensitive raw provider details'),
    );

    const provider = new OpenAIProvider({
      apiKey: 'test-openai-key',
      model: 'configured-openai-model',
      timeoutMs: 5000,
      maxOutputTokens: 100,
    });

    await expect(
      provider.generateCompletion({
        prompt: 'Hello',
      }),
    ).rejects.toMatchObject({
      name: 'AIProviderError',
      message: 'AI provider request failed',
      statusCode: 502,
      provider: 'openai',
      model: 'configured-openai-model',
    });
  });
});
