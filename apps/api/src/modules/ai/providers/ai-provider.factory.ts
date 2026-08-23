import { env } from '../../../config/env';
import { AIProvider } from './ai-provider.interface';
import { MockAIProvider } from './mock.provider';
import { OpenAIProvider } from './openai.provider';
import { GeminiProvider } from './gemini.provider';

export const createAIProvider = (): AIProvider => {
  const providerType = process.env.AI_PROVIDER || env.AI_PROVIDER;

  if (providerType === 'MOCK') {
    return new MockAIProvider();
  }

  if (providerType === 'OPENAI') {
    const apiKey = process.env.OPENAI_API_KEY;
    const model = process.env.AI_MODEL;

    if (!apiKey || !model || apiKey === 'sk-proj-your-openai-key-here') {
      throw new Error('OpenAI provider configuration is incomplete');
    }

    return new OpenAIProvider({
      apiKey,
      model,
      timeoutMs: env.AI_TIMEOUT_MS,
      maxOutputTokens: env.AI_MAX_OUTPUT_TOKENS,
      embeddingModel: env.AI_EMBEDDING_MODEL,
      baseURL: env.OPENAI_BASE_URL,
    });
  }

  if (providerType === 'GEMINI') {
    const apiKey = process.env.GEMINI_API_KEY;
    const model = process.env.AI_MODEL;

    if (!apiKey || !model) {
      throw new Error('Gemini provider configuration is incomplete');
    }

    return new GeminiProvider({
      apiKey,
      model,
      embeddingModel: env.AI_EMBEDDING_MODEL,
      embeddingDimensions: env.AI_EMBEDDING_DIMS,
      timeoutMs: env.AI_TIMEOUT_MS,
      maxOutputTokens: env.AI_MAX_OUTPUT_TOKENS,
    });
  }

  throw new Error(`Unsupported AI provider: ${providerType}`);
};
