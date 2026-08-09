import {
  AIProvider as PrismaAIProvider,
} from '@prisma/client';
import { AIProviderError } from '../providers/ai-provider.error';
import { prisma } from '../../../config/prisma';
import { AppError } from '../../../core/errors/AppError';
import { logger } from '../../../core/utils/logger';
import {
  recordAIError,
  recordAIRequest,
  recordAIRequestDurationSeconds,
  recordAITokens,
} from '../../../core/metrics/aiMetrics';
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
    // TeamSynch correlation id (HTTP x-request-id or BullMQ job id) —
    // persisted as AIUsageLog.requestId. The upstream provider request id
    // is NEVER stored in that DB field; it surfaces only in the failure
    // structured log as providerRequestId.
    correlationId?: string;
  }): Promise<{ embedding: number[]; totalTokens: number }> {
    const startedAt = Date.now();
    const provider = this.resolveProvider();
    const metricLabels = {
      feature: ctx?.feature ?? 'unknown',
      provider,
      kind: 'embedding' as const,
    };

    try {
      const response = await this.provider.generateEmbedding(text);
      const latencyMs = Date.now() - startedAt;

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
              latencyMs,
              success: true,
              requestId: ctx.correlationId ?? undefined,
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

      this.observeSafely('embedding success', () => {
        recordAIRequest({ ...metricLabels, result: 'success' });
        recordAIRequestDurationSeconds(metricLabels, latencyMs / 1000);
        // Embedding responses expose only total_tokens; do not fabricate
        // a prompt/completion split.
        recordAITokens(
          { ...metricLabels, tokenType: 'total' },
          response.usage.totalTokens,
        );

        logger.info('ai.call.completed', {
          event: 'ai.call.completed',
          correlationId: ctx?.correlationId,
          feature: metricLabels.feature,
          provider,
          model: response.model,
          kind: 'embedding',
          latencyMs,
          tokens: { total: response.usage.totalTokens },
        });
      });

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
      const latencyMs = Date.now() - startedAt;

      if (ctx) {
        await prisma.aIUsageLog
          .create({
            data: {
              organizationId: ctx.organizationId,
              userId: ctx.userId,
              feature: ctx.feature,
              provider,
              model: safeError.model,
              requestId: ctx.correlationId ?? undefined,
              promptTokens: 0,
              completionTokens: 0,
              totalTokens: 0,
              latencyMs,
              success: false,
              errorMessage: safeError.message,
            },
          })
          .catch(() => undefined);
      }

      this.observeSafely('embedding failure', () => {
        recordAIRequest({ ...metricLabels, result: 'failure' });
        recordAIRequestDurationSeconds(metricLabels, latencyMs / 1000);
        recordAIError(
          metricLabels.feature,
          provider,
          safeError.providerCode ?? 'unknown',
        );

        logger.warn('ai.call.failed', {
          event: 'ai.call.failed',
          correlationId: ctx?.correlationId,
          feature: metricLabels.feature,
          provider,
          model: safeError.model,
          kind: 'embedding',
          latencyMs,
          providerCode: safeError.providerCode,
          retryCount: safeError.retryCount,
          retryAfterSeconds: safeError.retryAfterSeconds,
          providerRequestId: safeError.requestId,
          errorMessage: safeError.message,
        });
      });

      throw safeError;
    }
  }

  async generateCompletion(
    organizationId: string,
    userId: string,
    feature: string,
    request: AICompletionRequest,
    correlationId?: string,
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
    const metricLabels = {
      feature: normalizedFeature,
      provider,
      kind: 'completion' as const,
    };

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
      const latencyMs = Date.now() - startedAt;

      this.observeSafely('completion failure', () => {
        recordAIRequest({ ...metricLabels, result: 'failure' });
        recordAIRequestDurationSeconds(metricLabels, latencyMs / 1000);
        recordAIError(
          normalizedFeature,
          provider,
          safeError.providerCode ?? 'unknown',
        );

        logger.warn('ai.call.failed', {
          event: 'ai.call.failed',
          correlationId,
          feature: normalizedFeature,
          provider,
          model: safeError.model,
          kind: 'completion',
          latencyMs,
          providerCode: safeError.providerCode,
          // Retry observability (ledger #20): the provider's configured
          // retry ceiling and any retry-after backoff hint, when the
          // provider surfaced a rate-limit error.
          retryCount: safeError.retryCount,
          retryAfterSeconds: safeError.retryAfterSeconds,
          // The upstream provider request id (if the provider exposes
          // one) stays in this structured log — it is NOT written into
          // AIUsageLog.requestId, which now holds the TeamSynch
          // correlation id exclusively.
          providerRequestId: safeError.requestId,
          errorMessage: safeError.message,
        });
      });

      await this.logUsage({
        organizationId,
        userId,
        feature: normalizedFeature,
        provider,
        success: false,
        latencyMs,
        response: null,
        errorMessage: safeError.message,
        model: safeError.model,
        correlationId,
      });

      throw safeError;
    }
    const latencyMs = Date.now() - startedAt;

    await this.logUsage({
      organizationId,
      userId,
      feature: normalizedFeature,
      provider,
      success: true,
      latencyMs,
      response,
      correlationId,
    });

    this.observeSafely('completion success', () => {
      recordAIRequest({ ...metricLabels, result: 'success' });
      recordAIRequestDurationSeconds(metricLabels, latencyMs / 1000);
      recordAITokens(
        { ...metricLabels, tokenType: 'prompt' },
        response.usage.promptTokens,
      );
      recordAITokens(
        { ...metricLabels, tokenType: 'completion' },
        response.usage.completionTokens,
      );
      recordAITokens(
        { ...metricLabels, tokenType: 'total' },
        response.usage.totalTokens,
      );

      logger.info('ai.call.completed', {
        event: 'ai.call.completed',
        correlationId,
        feature: normalizedFeature,
        provider,
        model: response.model,
        kind: 'completion',
        latencyMs,
        tokens: {
          prompt: response.usage.promptTokens,
          completion: response.usage.completionTokens,
          total: response.usage.totalTokens,
        },
      });
    });

    return response;
  }

  /** Best-effort observability: never breaks the AI request (warn-only). */
  private observeSafely(label: string, fn: () => void): void {
    try {
      fn();
    } catch (error: unknown) {
      console.warn(
        `[AIService] ${label} observability failure (non-fatal): ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
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
    correlationId,
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
    correlationId?: string;
  }): Promise<void> {
    await prisma.aIUsageLog.create({
      data: {
        organizationId,
        userId,
        feature,
        provider,
        model: response?.model ?? model ?? 'unknown',
        requestId: correlationId,
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
