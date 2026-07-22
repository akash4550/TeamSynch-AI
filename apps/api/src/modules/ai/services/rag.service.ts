import { VectorService } from './vector.service';
import { AIService } from './ai.service';
import { PROMPTS } from '../prompts';

export interface RAGAnswerResponse {
  answer: string;
  citations: Array<{
    documentId?: string;
    snippet: string;
    relevanceScore: number;
  }>;
}

export class RAGService {
  private vectorService = new VectorService();
  private aiService = new AIService();

  /**
   * Executes RAG Pipeline: Vector Retrieval -> Context Construction -> LLM Synthesis
   */
  async askRAGQuestion(
    organizationId: string,
    userId: string,
    query: string
  ): Promise<RAGAnswerResponse> {
    // 1. Vector similarity search over tenant chunks
    const relevantChunks = await this.vectorService.similaritySearch(
      organizationId,
      query,
      5
    );

    // 2. Build augmented prompt context from retrieved vector chunks
    const contextSnippets = relevantChunks
      .map((c, idx) => `[Source ${idx + 1}]:\n${c.contentChunk}`)
      .join('\n\n');

    const augmentedPrompt = `User Question: ${query}\n\nRetrieved Workspace Sources:\n${contextSnippets || 'No direct matching document chunks found.'}`;

    // 3. Generate LLM completion using Provider Factory
    const completion = await this.aiService.generateCompletion(
      organizationId,
      userId,
      'RAG_WORKSPACE_CHAT',
      {
        systemPrompt: `${PROMPTS.SYSTEM.DEFAULT_ASSISTANT}\nAnswer the user question strictly using the provided Retrieved Workspace Sources. Cite source numbers when making factual assertions.`,
        prompt: augmentedPrompt,
      }
    );

    // 4. Map citations with relevance scores
    const citations = relevantChunks.map((c) => ({
      documentId: c.documentId,
      snippet: c.contentChunk.slice(0, 150) + '...',
      relevanceScore: Math.max(0, Math.round((1 - c.distance) * 100)),
    }));

    return {
      answer: completion.text,
      citations,
    };
  }
}
