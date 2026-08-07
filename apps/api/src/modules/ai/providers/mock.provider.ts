import { AIProvider, AICompletionRequest, AICompletionResponse, AIEmbeddingResponse } from './ai-provider.interface';
import { AIProviderError } from './ai-provider.error';

export class MockAIProvider implements AIProvider {
  readonly name = 'mock';

  /*
   * FEATURE (ledger #9): embeddings must be REAL. The mock completion
   * provider fabricates text harmlessly (dev UX), but a fabricated vector
   * would silently poison the pgvector store and every citation score
   * downstream — so this fails CLOSED (same precedent as the #91 billing
   * 503): set AI_PROVIDER=OPENAI with a real OPENAI_API_KEY for RAG.
   */
  async generateEmbedding(_text: string): Promise<AIEmbeddingResponse> {
    throw new AIProviderError(
      'Embeddings require a real AI provider (set AI_PROVIDER=OPENAI with OPENAI_API_KEY)',
      { provider: this.name, model: 'none', statusCode: 503, providerCode: 'embeddings_unavailable' },
    );
  }

  async generateCompletion(request: AICompletionRequest): Promise<AICompletionResponse> {
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Calculate rough tokens for the mock usage
    const promptTokens = request.prompt.split(' ').length;
    const mockResponseText = `This is a mock AI response generated based on your prompt: "${request.prompt.substring(0, 30)}..."`;
    const completionTokens = mockResponseText.split(' ').length;

    return {
      text: mockResponseText,
      usage: {
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
      },
      provider: this.name,
      model: 'mock-model-v1',
    };
  }

  async generateJSON<T>(request: AICompletionRequest): Promise<T> {
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // Attempt a generic mock response based on T if possible, 
    // for this mockup we will just return an empty object cast as T.
    return {} as T;
  }
}
