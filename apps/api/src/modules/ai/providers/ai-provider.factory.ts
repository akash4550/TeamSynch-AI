import { env } from '../../../config/env';
import { AIProvider } from './ai-provider.interface';
import { MockAIProvider } from './mock.provider';
import { OpenAIProvider } from './openai.provider';

export const createAIProvider = (): AIProvider => {
  const providerType = process.env.AI_PROVIDER || env.AI_PROVIDER;
  if (providerType === 'MOCK') {
    return new MockAIProvider();
  }

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
  });
};
