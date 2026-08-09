import { EVAL_CORPUS } from '../dataset';
import { parseCliArgs, runEvaluationWithRetriever } from '../evaluate';
import { RagEvaluationError } from '../metrics';
import { VectorRetriever } from '../retrievers/vector.retriever';
import type { VectorService } from '../../services/vector.service';

jest.mock('../../services/vector.service', () => ({
  VectorService: jest.fn(),
}));

describe('VectorRetriever (read-only pgvector adapter)', () => {
  const makeServiceMock = (chunks: Array<{ contentChunk: string }>) =>
    ({
      similaritySearch: jest.fn().mockResolvedValue({
        chunks,
        retrievalMethod: 'vector',
      }),
    }) as unknown as VectorService;

  it('maps retrieved contentChunk text back to corpus ids in rank order', async () => {
    const target = EVAL_CORPUS.find((c) => c.id === 'chunk:tasks-priority');
    const target2 = EVAL_CORPUS.find((c) => c.id === 'chunk:tasks-dependencies');
    expect(target).toBeDefined();
    expect(target2).toBeDefined();

    const mockService = makeServiceMock([
      { contentChunk: `  ${target!.content}  ` }, // whitespace-normalized
      { contentChunk: 'some chunk not in the evaluation corpus' },
      { contentChunk: target2!.content },
    ]);

    const retriever = new VectorRetriever(mockService, 'org-eval', EVAL_CORPUS);
    const ranked = await retriever.retrieve('task priority', 5);

    expect(ranked).toEqual(['chunk:tasks-priority', 'chunk:tasks-dependencies']);
    expect(mockService.similaritySearch).toHaveBeenCalledWith('org-eval', 'task priority', 5);
    expect(retriever.name).toBe('pgvector');
  });

  it('returns an empty ranking when nothing maps to the corpus', async () => {
    const mockService = makeServiceMock([
      { contentChunk: 'unrelated row one' },
      { contentChunk: 'unrelated row two' },
    ]);
    const retriever = new VectorRetriever(mockService, 'org-eval', EVAL_CORPUS);
    expect(await retriever.retrieve('anything', 5)).toEqual([]);
  });

  it('de-duplicates repeated content and preserves rank order', async () => {
    const target = EVAL_CORPUS.find((c) => c.id === 'chunk:billing-plans');
    expect(target).toBeDefined();
    const mockService = makeServiceMock([
      { contentChunk: target!.content },
      { contentChunk: target!.content },
    ]);
    const retriever = new VectorRetriever(mockService, 'org-eval', EVAL_CORPUS);
    expect(await retriever.retrieve('billing plan', 5)).toEqual(['chunk:billing-plans']);
  });
});

describe('runEvaluationWithRetriever', () => {
  it('scores a stub retriever with the same pure metrics', async () => {
    const stubRetriever = {
      name: 'stub',
      retrieve: async (query: string) =>
        query.includes('task priority') ? ['chunk:tasks-priority'] : [],
    };

    const report = await runEvaluationWithRetriever(stubRetriever, undefined, undefined, 5, [1, 3, 5]);

    expect(report.totalCases).toBeGreaterThan(0);
    expect(report.caseScores.find((s) => s.caseId === 'case:task-priority')?.recallAtK[1]).toBe(1);
  });

  it('validates the dataset before retrieving', async () => {
    const stubRetriever = {
      name: 'stub',
      retrieve: async () => [],
    };

    await expect(
      runEvaluationWithRetriever(
        stubRetriever,
        [
          {
            id: 'case:bad',
            category: 'x',
            query: 'question?',
            expectedRelevantChunkIds: ['chunk:does-not-exist'],
          },
        ],
        EVAL_CORPUS,
        5,
        [1, 3, 5],
      ),
    ).rejects.toThrow(/does not exist in the corpus/);
  });
});

describe('parseCliArgs', () => {
  it('defaults to the deterministic retriever', () => {
    expect(parseCliArgs([])).toEqual({ retriever: 'deterministic' });
  });

  it('parses the vector retriever with an organization id', () => {
    expect(parseCliArgs(['--retriever', 'vector', '--organization', 'org-123'])).toEqual({
      retriever: 'vector',
      organizationId: 'org-123',
    });
  });

  it('rejects vector without an organization', () => {
    expect(() => parseCliArgs(['--retriever', 'vector'])).toThrow(RagEvaluationError);
  });

  it('rejects unknown flags and unsupported retrievers', () => {
    expect(() => parseCliArgs(['--bogus'])).toThrow(RagEvaluationError);
    expect(() => parseCliArgs(['--retriever', 'hybrid'])).toThrow(RagEvaluationError);
  });
});
