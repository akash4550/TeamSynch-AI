import {
  AIProvider as PrismaAIProvider,
} from '@prisma/client';
import { AIProviderError } from '../providers/ai-provider.error';
import { prisma } from '../../../config/prisma';
import { AppError } from '../../../core/errors/AppError';
import {
  AICompletionRequest,
  AICompletionResponse,
  AIProvider,
} from '../providers/ai-provider.interface';
import { createAIProvider } from '../providers/ai-provider.factory';

export class AIService {
  private readonly provider: AIProvider;

  constructor(
    provider: AIProvider = createAIProvider(),
  ) {
    this.provider = provider;
  }

  /*
   * FEATURE (ledger #9 — 2026-08-05): real embeddings. The previous body
   * returned `Array.from({length: 1536}, (_, i) => Math.sin(seed + i) * 0.05)`
   * — deterministic pseudo-vectors whose "similarity" was a hash collision
   * pattern, so every RAG citation was scored against noise. Embeddings now
   * come from the provider's real endpoint (OpenAI text-embedding-3-small by
   * default); the mock provider fails CLOSED (503) rather than fabricate
   * floats. Usage is logged under caller-supplied features:
   *   - 'rag_ingest'   (document chunks — billed to the org's monthly RAG
   *                    budget, AI_RAG_MONTHLY_TOKEN_BUDGET) and
   *   - 'rag_query'    (similarity search per question),
   * each attributed to the supplied acting user (document uploader / asking
   * user) because AIUsageLog.userId is NOT NULL.
   */
  // Returns the real billed token count alongside the vector — callers
  // (RAG ingestion budget) must never estimate cost from text length.
  async generateEmbedding(text: string, ctx?: {
    organizationId: string;
    userId: string;
    feature: string;
  }): Promise<{ embedding: number[]; totalTokens: number }> {
    const startedAt = Date.now();
    const provider = this.resolveProvider();

    try {
      const response = await this.provider.generateEmbedding(text);

      // Budget accounting rides AIUsageLog; a logging failure must never
      // break ingestion/search (best-effort, same posture as a dropped
      // metric, but it IS logged so budget drift is discoverable).
      if (ctx) {
        await prisma.aIUsageLog
          .create({
            data: {
              organizationId: ctx.organizationId,
              userId: ctx.userId,
              feature: ctx.feature,
              provider,
              model: response.model,
              promptTokens: response.usage.totalTokens,
              completionTokens: 0,
              totalTokens: response.usage.totalTokens,
              latencyMs: Date.now() - startedAt,
              success: true,
            },
          })
          .catch((logError: unknown) => {
            console.warn(
              `[AIService] Embedding usage log failed (budget drift risk): ${
                logError instanceof Error ? logError.message : String(logError)
              }`,
            );
          });
      }

      return { embedding: response.embedding, totalTokens: response.usage.totalTokens };
    } catch (error: unknown) {
      const safeError =
        error instanceof AIProviderError
          ? error
          : new AIProviderError('AI embedding request failed', {
              provider: this.provider.name,
              model: 'unknown',
              statusCode: 502,
            });

      if (ctx) {
        await prisma.aIUsageLog
          .create({
            data: {
              organizationId: ctx.organizationId,
              userId: ctx.userId,
              feature: ctx.feature,
              provider,
              model: safeError.model,
              requestId: safeError.requestId,
              promptTokens: 0,
              completionTokens: 0,
              totalTokens: 0,
              latencyMs: Date.now() - startedAt,
              success: false,
              errorMessage: safeError.message,
            },
          })
          .catch(() => undefined);
      }

      throw safeError;
    }
  }

  async generateCompletion(
    organizationId: string,
    userId: string,
    feature: string,
    request: AICompletionRequest,
  ): Promise<AICompletionResponse> {
    if (!organizationId) {
      throw new AppError(
        'Organization context is required for AI usage',
        400,
      );
    }

    if (!userId) {
      throw new AppError(
        'User context is required for AI usage',
        400,
      );
    }

    const normalizedFeature = feature.trim();

    if (!normalizedFeature) {
      throw new AppError(
        'AI feature is required',
        400,
      );
    }

    const prompt = request.prompt.trim();

    if (!prompt) {
      throw new AppError(
        'AI prompt is required',
        400,
      );
    }

    const normalizedRequest: AICompletionRequest = {
      ...request,
      prompt,
      systemPrompt:
        request.systemPrompt?.trim() || undefined,
    };

    const provider = this.resolveProvider();
    const startedAt = Date.now();

    let response: AICompletionResponse;

    try {
      response =
        await this.provider.generateCompletion(
          normalizedRequest,
        );
        } catch (error: unknown) {
      const safeError =
        error instanceof AIProviderError
          ? error
          : new AIProviderError(
              'AI provider request failed',
              {
                provider: this.provider.name,
                model: 'unknown',
                statusCode: 502,
              },
            );

      await this.logUsage({
        organizationId,
        userId,
        feature: normalizedFeature,
        provider,
        success: false,
        latencyMs: Date.now() - startedAt,
        response: null,
        errorMessage: safeError.message,
        model: safeError.model,
        requestId: safeError.requestId,
      });

      throw safeError;
    }
    await this.logUsage({
      organizationId,
      userId,
      feature: normalizedFeature,
      provider,
      success: true,
      latencyMs: Date.now() - startedAt,
      response,
    });

    return response;
  }

  private resolveProvider():
    PrismaAIProvider {
    const providerName =
      this.provider.name.trim().toUpperCase();

    if (
      !Object.values(PrismaAIProvider).includes(
        providerName as PrismaAIProvider,
      )
    ) {
      throw new AppError(
        `Unsupported AI provider: ${this.provider.name}`,
        500,
      );
    }

    return providerName as PrismaAIProvider;
  }

  private async logUsage({
    organizationId,
    userId,
    feature,
    provider,
    success,
    latencyMs,
    response,
    errorMessage,
    model,
    requestId,
  }: {
    organizationId: string;
    userId: string;
    feature: string;
    provider: PrismaAIProvider;
    success: boolean;
    latencyMs: number;
    response: AICompletionResponse | null;
    errorMessage?: string;
    model?: string;
    requestId?: string;
  }): Promise<void> {
    await prisma.aIUsageLog.create({
      data: {
        organizationId,
        userId,
        feature,
        provider,
        model: response?.model ?? model ?? 'unknown',
        requestId,
        promptTokens:
          response?.usage.promptTokens ?? 0,
        completionTokens:
          response?.usage.completionTokens ?? 0,
        totalTokens:
          response?.usage.totalTokens ?? 0,
        latencyMs,
        success,
        errorMessage,
      },
    });
  }
}
