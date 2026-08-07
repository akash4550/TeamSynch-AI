import { VectorService } from './vector.service';
import { AIService } from './ai.service';
import { PROMPTS } from '../prompts';

export interface RAGAnswerResponse {
  answer: string;
  // 'vector' = real cosine retrieval; 'text_fallback' = pg_trgm/ILIKE
  // lexical retrieval (citations carry relevanceScore: null — the UI shows
  // "text match", never a fabricated percentage).
  retrievalMethod: 'vector' | 'text_fallback';
  citations: Array<{
    documentId?: string;
    snippet: string;
    // Ledger #9: null whenever retrieval was NOT a real vector distance
    // (previously the fallback pinned 0.2 → a fabricated "80% Match").
    relevanceScore: number | null;
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
    // 1. Similarity search over tenant chunks. Ledger #9: the asking user is
    //    threaded through so the question-embedding call is billed to them
    //    (feature 'rag_query') — the previous code embedded with no tenant
    //    or user attribution at all. An embedding-provider outage surfaces
    //    as an honest 503 (see VectorService) instead of fabricated results.
    const { chunks: relevantChunks, retrievalMethod } =
      await this.vectorService.similaritySearch(organizationId, query, 5, userId);

    // 2. Build augmented prompt context from retrieved chunks
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

    // 4. Map citations — relevance only exists for real vector distances.
    const citations = relevantChunks.map((c) => ({
      documentId: c.documentId,
      snippet: c.contentChunk.slice(0, 150) + '...',
      relevanceScore:
        c.distance === null
          ? null
          : Math.max(0, Math.round((1 - c.distance) * 100)),
    }));

    return {
      answer: completion.text,
      retrievalMethod,
      citations,
    };
  }
}
