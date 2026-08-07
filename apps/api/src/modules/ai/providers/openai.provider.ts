import OpenAI from 'openai';
import {
  AICompletionRequest,
  AICompletionResponse,
  AIEmbeddingResponse,
  AIProvider,
} from './ai-provider.interface';
import { AIProviderError } from './ai-provider.error';

export interface OpenAIProviderOptions {
  apiKey: string;
  model: string;
  timeoutMs: number;
  maxOutputTokens: number;
  // FEATURE (ledger #9): chat model and embedding model are configured
  // independently (completions and embeddings are different endpoints);
  // baseURL makes the provider OpenAI-compatible-server friendly
  // (Ollama/vLLM/LiteLLM gateways).
  embeddingModel?: string;
  baseURL?: string;
}

export class OpenAIProvider implements AIProvider {
  readonly name = 'openai';

  private readonly client: OpenAI;
  private readonly model: string;
  private readonly embeddingModel: string;
  private readonly maxOutputTokens: number;

  constructor(options: OpenAIProviderOptions) {
    this.client = new OpenAI({
      apiKey: options.apiKey,
      timeout: options.timeoutMs,
      maxRetries: 2,
      logLevel: 'off',
      ...(options.baseURL ? { baseURL: options.baseURL } : {}),
    });

    this.model = options.model;
    // Default must stay in lockstep with the pgvector column width
    // (vector(1536)) — see prisma/migrations/20260805010000.
    this.embeddingModel = options.embeddingModel ?? 'text-embedding-3-small';
    this.maxOutputTokens = options.maxOutputTokens;
  }

  /*
   * FEATURE (ledger #9): REAL embeddings via the official endpoint —
   * replaces AIService's `Math.sin(seed+i)*0.05` pseudo-vectors. Token
   * usage rides the API response and is logged by AIService for the
   * per-org monthly RAG budget (AI_RAG_MONTHLY_TOKEN_BUDGET).
   */
  async generateEmbedding(text: string): Promise<AIEmbeddingResponse> {
    try {
      const response = await this.client.embeddings.create({
        model: this.embeddingModel,
        input: text,
      });

      return {
        embedding: response.data[0]?.embedding ?? [],
        model: response.model,
        usage: {
          totalTokens: response.usage?.total_tokens ?? 0,
        },
      };
    } catch (error: unknown) {
      throw this.normalizeError(error);
    }
  }

  async generateCompletion(
    request: AICompletionRequest,
  ): Promise<AICompletionResponse> {
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];

    if (request.systemPrompt) {
      messages.push({
        role: 'system',
        content: request.systemPrompt,
      });
    }

    messages.push({
      role: 'user',
      content: request.prompt,
    });

    let completion: OpenAI.Chat.Completions.ChatCompletion;

    try {
  completion = await this.client.chat.completions.create({
    model: this.model,
    messages,
    max_completion_tokens:
      request.maxTokens ?? this.maxOutputTokens,
    temperature: request.temperature,
    stop: request.stopSequences,
    store: false,
  });
} catch (error: unknown) {
  throw this.normalizeError(error);
}

    return {
      text: completion.choices[0]?.message.content ?? '',
      usage: {
        promptTokens: completion.usage?.prompt_tokens ?? 0,
        completionTokens: completion.usage?.completion_tokens ?? 0,
        totalTokens: completion.usage?.total_tokens ?? 0,
      },
      provider: this.name,
      model: completion.model,
    };
  }
    private normalizeError(error: unknown): AIProviderError {
    if (error instanceof OpenAI.APIConnectionTimeoutError) {
      return new AIProviderError(
        'AI provider request timed out',
        {
          provider: this.name,
          model: this.model,
          statusCode: 504,
          providerCode: 'timeout',
        },
      );
    }

    if (error instanceof OpenAI.RateLimitError) {
      return new AIProviderError(
        'AI provider rate limit exceeded',
        {
          provider: this.name,
          model: this.model,
          statusCode: 429,
          requestId: error.requestID ?? undefined,
          providerCode: error.code ?? 'rate_limit',
        },
      );
    }

    if (error instanceof OpenAI.APIConnectionError) {
      return new AIProviderError(
        'AI provider is temporarily unavailable',
        {
          provider: this.name,
          model: this.model,
          statusCode: 503,
          providerCode: 'connection_error',
        },
      );
    }

    if (error instanceof OpenAI.APIError) {
      return new AIProviderError(
        'AI provider request failed',
        {
          provider: this.name,
          model: this.model,
          statusCode: 502,
          requestId: error.requestID ?? undefined,
          providerCode: error.code ?? undefined,
        },
      );
    }

    return new AIProviderError(
      'AI provider request failed',
      {
        provider: this.name,
        model: this.model,
        statusCode: 502,
      },
    );
  }
}
