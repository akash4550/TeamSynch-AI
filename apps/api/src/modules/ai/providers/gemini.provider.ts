import {
  AICompletionRequest,
  AICompletionResponse,
  AIEmbeddingResponse,
  AIProvider,
} from './ai-provider.interface';
import { AIProviderError } from './ai-provider.error';

export interface GeminiProviderOptions {
  apiKey: string;
  model: string;
  embeddingModel: string;
  embeddingDimensions: number;
  timeoutMs: number;
  maxOutputTokens: number;
}

interface GeminiErrorPayload {
  error?: {
    code?: number;
    message?: string;
    status?: string;
  };
}

export class GeminiProvider implements AIProvider {
  readonly name = 'gemini';

  private readonly apiKey: string;
  private readonly model: string;
  private readonly embeddingModel: string;
  private readonly embeddingDimensions: number;
  private readonly timeoutMs: number;
  private readonly maxOutputTokens: number;

  constructor(options: GeminiProviderOptions) {
    this.apiKey = options.apiKey;
    this.model = options.model;
    this.embeddingModel = options.embeddingModel;
    this.embeddingDimensions = options.embeddingDimensions;
    this.timeoutMs = options.timeoutMs;
    this.maxOutputTokens = options.maxOutputTokens;
  }

  private endpoint(model: string, action: 'generateContent' | 'embedContent'): string {
    return `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:${action}`;
  }

  private retryAfterSeconds(response: Response): number | undefined {
    const value = response.headers.get('retry-after');
    return value && Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : undefined;
  }

  private async request<T>(
    model: string,
    action: 'generateContent' | 'embedContent',
    body: Record<string, unknown>,
  ): Promise<T> {
    let response: Response;

    try {
      response = await fetch(this.endpoint(model, action), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': this.apiKey,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error: unknown) {
      const isTimeout =
        error instanceof DOMException && error.name === 'TimeoutError';

      throw new AIProviderError(
        isTimeout ? 'Gemini API request timed out' : 'Gemini API is temporarily unavailable',
        {
          provider: this.name,
          model,
          statusCode: isTimeout ? 504 : 503,
          providerCode: isTimeout ? 'timeout' : 'connection_error',
        },
      );
    }

    if (response.ok) {
      return (await response.json()) as T;
    }

    const payload = (await response.json().catch(() => ({}))) as GeminiErrorPayload;
    const message = payload.error?.message ?? 'Gemini API request failed';
    const providerCode = payload.error?.status ?? String(payload.error?.code ?? response.status);

    if (response.status === 429) {
      throw new AIProviderError('Gemini API rate limit exceeded', {
        provider: this.name,
        model,
        statusCode: 429,
        providerCode,
        retryAfterSeconds: this.retryAfterSeconds(response),
      });
    }

    if (response.status === 401 || response.status === 403) {
      throw new AIProviderError('Gemini API authentication or permission failed', {
        provider: this.name,
        model,
        statusCode: 401,
        providerCode,
      });
    }

    if (response.status >= 500) {
      throw new AIProviderError('Gemini API is temporarily unavailable', {
        provider: this.name,
        model,
        statusCode: 503,
        providerCode,
      });
    }

    throw new AIProviderError(message, {
      provider: this.name,
      model,
      statusCode: 502,
      providerCode,
    });
  }

  async generateCompletion(request: AICompletionRequest): Promise<AICompletionResponse> {
    const response = await this.request<{
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      usageMetadata?: {
        promptTokenCount?: number;
        candidatesTokenCount?: number;
        totalTokenCount?: number;
      };
      modelVersion?: string;
    }>(this.model, 'generateContent', {
      ...(request.systemPrompt
        ? { systemInstruction: { parts: [{ text: request.systemPrompt }] } }
        : {}),
      contents: [{ role: 'user', parts: [{ text: request.prompt }] }],
      generationConfig: {
        maxOutputTokens: request.maxTokens ?? this.maxOutputTokens,
        temperature: request.temperature,
        stopSequences: request.stopSequences,
      },
    });

    const text = response.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? '')
      .join('') ?? '';

    const promptTokens = response.usageMetadata?.promptTokenCount ?? 0;
    const completionTokens = response.usageMetadata?.candidatesTokenCount ?? 0;

    return {
      text,
      usage: {
        promptTokens,
        completionTokens,
        totalTokens: response.usageMetadata?.totalTokenCount ?? promptTokens + completionTokens,
      },
      provider: this.name,
      model: response.modelVersion ?? this.model,
    };
  }

  async generateEmbedding(text: string): Promise<AIEmbeddingResponse> {
    const response = await this.request<{
      embedding?: { values?: number[] };
      usageMetadata?: { promptTokenCount?: number };
    }>(this.embeddingModel, 'embedContent', {
      content: { parts: [{ text }] },
      outputDimensionality: this.embeddingDimensions,
    });

    return {
      embedding: response.embedding?.values ?? [],
      model: this.embeddingModel,
      usage: {
        totalTokens: response.usageMetadata?.promptTokenCount ?? 0,
      },
    };
  }
}
