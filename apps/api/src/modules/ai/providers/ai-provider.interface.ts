export interface AICompletionRequest {
  prompt: string;
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
  stopSequences?: string[];
}

export interface AICompletionResponse {
  text: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  provider: string;
  model: string;
}

/*
 * FEATURE (ledger #9 — real RAG ingestion, 2026-08-05): embeddings are a
 * first-class provider capability. AIService.generateEmbedding previously
 * returned `Math.sin(seed+i)*0.05` pseudo-vectors — every similarity query
 * was comparing deterministic noise. Real providers must now implement
 * this; providers that cannot (mock) fail CLOSED so no fabricated vector
 * can ever reach the pgvector store.
 */
export interface AIEmbeddingResponse {
  embedding: number[];
  model: string;
  usage: {
    totalTokens: number;
  };
}

export interface AIProvider {
  /**
   * Identifies the provider (e.g. 'openai', 'anthropic', 'mock')
   */
  readonly name: string;

  /**
   * Generates a standard text completion
   */
  generateCompletion(request: AICompletionRequest): Promise<AICompletionResponse>;

  /**
   * Generates a real vector embedding for pgvector storage/retrieval.
   * Implementations that lack an embedding endpoint must throw
   * AIProviderError (503) rather than return fabricated floats.
   */
  generateEmbedding(text: string): Promise<AIEmbeddingResponse>;

  /**
   * Placeholder for Structured JSON Output
   */
  generateJSON?<T>(request: AICompletionRequest): Promise<T>;
}
