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

  /**
   * Generates a 1536-dimensional float vector embedding for pgvector storage
   */
  async generateEmbedding(text: string): Promise<number[]> {
    const seed = text.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return Array.from({ length: 1536 }, (_, i) => Math.sin(seed + i) * 0.05);
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
