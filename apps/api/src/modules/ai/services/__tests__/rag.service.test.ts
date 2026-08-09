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
