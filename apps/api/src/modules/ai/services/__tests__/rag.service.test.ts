import { RAGService } from '../rag.service';
import { VectorService } from '../../services/vector.service';
import { AIService } from '../../services/ai.service';
import {
  recordRagRetrieval,
  recordRagStageDuration,
} from '../../../../core/metrics/aiMetrics';

jest.mock('../../services/vector.service', () => ({
  VectorService: jest.fn().mockImplementation(() => ({
    similaritySearch: jest.fn(),
  })),
}));

jest.mock('../../services/ai.service', () => ({
  AIService: jest.fn().mockImplementation(() => ({
    generateCompletion: jest.fn(),
  })),
}));

jest.mock('../../../../core/metrics/aiMetrics', () => ({
  recordRagRetrieval: jest.fn(),
  recordRagStageDuration: jest.fn(),
}));

describe('RAGService observability', () => {
  const vectorSearchMock = jest.fn();
  const completionMock = jest.fn();
  const recordRetrievalMock = recordRagRetrieval as jest.Mock;
  const recordStageMock = recordRagStageDuration as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    (VectorService as unknown as jest.Mock).mockImplementation(() => ({
      similaritySearch: vectorSearchMock,
    }));
    (AIService as unknown as jest.Mock).mockImplementation(() => ({
      generateCompletion: completionMock,
    }));
    vectorSearchMock.mockResolvedValue({
      chunks: [{ id: 'c1', contentChunk: 'chunk one' }],
      retrievalMethod: 'vector',
    });
    completionMock.mockResolvedValue({
      text: 'answer',
      usage: { promptTokens: 5, completionTokens: 3, totalTokens: 8 },
      provider: 'mock',
      model: 'mock-model-v1',
    });
  });

  it('records the retrieval method and both stage latencies', async () => {
    const service = new RAGService();
    const result = await service.askRAGQuestion('org-1', 'user-1', 'question', 'corr-1');

    expect(result.retrievalMethod).toBe('vector');
    expect(recordRetrievalMock).toHaveBeenCalledWith('vector');
    expect(recordStageMock).toHaveBeenCalledWith('retrieval', expect.any(Number));
    expect(recordStageMock).toHaveBeenCalledWith('generation', expect.any(Number));
  });

  it('records the lexical fallback method when used', async () => {
    vectorSearchMock.mockResolvedValue({
      chunks: [{ id: 'c2', contentChunk: 'fallback chunk' }],
      retrievalMethod: 'text_fallback',
    });

    const service = new RAGService();
    await service.askRAGQuestion('org-1', 'user-1', 'question');

    expect(recordRetrievalMock).toHaveBeenCalledWith('text_fallback');
  });

  it('passes the correlation id through to search and completion', async () => {
    const service = new RAGService();
    await service.askRAGQuestion('org-1', 'user-1', 'question', 'corr-42');

    expect(vectorSearchMock).toHaveBeenCalledWith('org-1', 'question', 5, 'user-1', 'corr-42');
    expect(completionMock).toHaveBeenCalledWith(
      'org-1',
      'user-1',
      'RAG_WORKSPACE_CHAT',
      expect.objectContaining({ prompt: expect.stringContaining('question') }),
      'corr-42',
    );
  });

  it('still records retrieval latency when retrieval throws (non-fatal observability)', async () => {
    vectorSearchMock.mockRejectedValue(new Error('retrieval failed'));
    const service = new RAGService();

    await expect(service.askRAGQuestion('org-1', 'user-1', 'question')).rejects.toThrow(
      'retrieval failed',
    );
    // The retrieval-method metric is not recorded (no method to record),
    // but the stage timing must still be attempted without masking the error.
    expect(recordStageMock).toHaveBeenCalledWith('retrieval', expect.any(Number));
  });
});

describe('RAGService core contract (askRAGQuestion)', () => {
  const vectorSearchMock = jest.fn();
  const completionMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (VectorService as unknown as jest.Mock).mockImplementation(() => ({
      similaritySearch: vectorSearchMock,
    }));
    (AIService as unknown as jest.Mock).mockImplementation(() => ({
      generateCompletion: completionMock,
    }));
  });

  it('builds the augmented prompt with numbered sources and a strict system prompt', async () => {
    vectorSearchMock.mockResolvedValue({
      chunks: [
        { id: 'c1', documentId: 'doc-1', contentChunk: 'chunk alpha', distance: 0.1 },
        { id: 'c2', documentId: 'doc-2', contentChunk: 'chunk beta', distance: 0.4 },
      ],
      retrievalMethod: 'vector',
    });
    completionMock.mockResolvedValue({
      text: 'the answer',
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      provider: 'mock',
      model: 'mock-model-v1',
    });

    const service = new RAGService();
    const result = await service.askRAGQuestion('org-1', 'user-1', 'What is alpha?');

    const completionCall = completionMock.mock.calls[0];
    expect(completionCall[2]).toBe('RAG_WORKSPACE_CHAT');
    expect(completionCall[3].prompt).toContain('User Question: What is alpha?');
    expect(completionCall[3].prompt).toContain('[Source 1]:\nchunk alpha');
    expect(completionCall[3].prompt).toContain('[Source 2]:\nchunk beta');
    expect(completionCall[3].systemPrompt).toContain(
      'Answer the user question strictly using the provided Retrieved Workspace Sources. Cite source numbers when making factual assertions.',
    );
    expect(completionCall[4]).toBeUndefined(); // no correlation id passed

    expect(result.answer).toBe('the answer');
    expect(result.retrievalMethod).toBe('vector');
  });

  it('maps citations with real relevance scores for vector retrieval', async () => {
    vectorSearchMock.mockResolvedValue({
      chunks: [
        { id: 'c1', documentId: 'doc-1', contentChunk: 'a'.repeat(200), distance: 0.1 },
        { id: 'c2', documentId: 'doc-2', contentChunk: 'short chunk', distance: 0.5 },
      ],
      retrievalMethod: 'vector',
    });
    completionMock.mockResolvedValue({
      text: 'answer',
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
      provider: 'mock',
      model: 'mock-model-v1',
    });

    const service = new RAGService();
    const result = await service.askRAGQuestion('org-1', 'user-1', 'q');

    // (1 - 0.1) * 100 = 90, (1 - 0.5) * 100 = 50
    expect(result.citations).toEqual([
      { documentId: 'doc-1', snippet: 'a'.repeat(150) + '...', relevanceScore: 90 },
      { documentId: 'doc-2', snippet: 'short chunk...', relevanceScore: 50 },
    ]);
  });

  it('keeps relevanceScore null for lexical fallback (no fabricated percentage)', async () => {
    // Ledger #9: distance is null in the fallback -> relevanceScore MUST
    // be null (the old code pinned 0.2 -> a fabricated "80% Match").
    vectorSearchMock.mockResolvedValue({
      chunks: [{ id: 'c1', documentId: 'doc-1', contentChunk: 'fallback hit', distance: null }],
      retrievalMethod: 'text_fallback',
    });
    completionMock.mockResolvedValue({
      text: 'answer',
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
      provider: 'mock',
      model: 'mock-model-v1',
    });

    const service = new RAGService();
    const result = await service.askRAGQuestion('org-1', 'user-1', 'q');

    expect(result.retrievalMethod).toBe('text_fallback');
    expect(result.citations).toEqual([
      { documentId: 'doc-1', snippet: 'fallback hit...', relevanceScore: null },
    ]);
  });

  it('handles empty retrieval with an honest no-sources prompt', async () => {
    vectorSearchMock.mockResolvedValue({
      chunks: [],
      retrievalMethod: 'text_fallback',
    });
    completionMock.mockResolvedValue({
      text: 'answer',
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
      provider: 'mock',
      model: 'mock-model-v1',
    });

    const service = new RAGService();
    const result = await service.askRAGQuestion('org-1', 'user-1', 'q');

    expect(completionMock.mock.calls[0][3].prompt).toContain(
      'No direct matching document chunks found.',
    );
    expect(result.citations).toEqual([]);
  });
});
