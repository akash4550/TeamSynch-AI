import OpenAI, { RateLimitError as OpenAIRateLimitError } from 'openai';
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

  // Retry observability (ledger #20): the SDK retries internally up to
  // this bound; keep in sync with the client's maxRetries so error
  // telemetry reports the true ceiling.
  private readonly maxRetries = 2;

  private readonly client: OpenAI;
  private readonly model: string;
  private readonly embeddingModel: string;
  private readonly maxOutputTokens: number;

  constructor(options: OpenAIProviderOptions) {
    this.client = new OpenAI({
      apiKey: options.apiKey,
      timeout: options.timeoutMs,
      maxRetries: this.maxRetries,
      logLevel: 'off',
      ...(options.baseURL ? { baseURL: options.baseURL } : {}),
    });

    this.model = options.model;
    // Default must stay in lockstep with the pgvector column width
    // (vector(1536)) — see prisma/migrations/20260805010000.
    this.embeddingModel = options.embeddingModel ?? 'text-embedding-3-small';
    this.maxOutputTokens = options.maxOutputTokens;
  }

  /** Reads the provider's retry-after backoff hint (seconds) when present. */
  private readRetryAfterSeconds(error: OpenAIRateLimitError): number | undefined {
    const retryAfterRaw = error.headers?.get('retry-after');
    if (typeof retryAfterRaw === 'string' && Number.isFinite(Number(retryAfterRaw))) {
      return Math.max(0, Number(retryAfterRaw));
    }
    return undefined;
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
      // Retry observability (ledger #20): the OpenAI SDK retries
      // internally up to maxRetries times before surfacing this error,
      // but does not expose the actual retry count. What IS observable
      // from the final error is the provider's backoff signal — the
      // retry-after header (in seconds) — plus the SDK's configured
      // maxRetries, which bounds how many internal retries could have
      // occurred. Both are surfaced in the failure log/metric so
      // retry amplification is visible instead of silent.
      const retryAfterSeconds = this.readRetryAfterSeconds(error);

      return new AIProviderError(
        'AI provider rate limit exceeded',
        {
          provider: this.name,
          model: this.model,
          statusCode: 429,
          requestId: error.requestID ?? undefined,
          providerCode: error.code ?? 'rate_limit',
          retryCount: this.maxRetries,
          retryAfterSeconds,
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
