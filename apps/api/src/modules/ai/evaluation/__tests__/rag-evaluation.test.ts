import { EVAL_CASES, EVAL_CORPUS } from '../dataset';
import { rankLexical, runEvaluation, tokenize, validateDataset } from '../evaluate';
import {
  evaluateCases,
  firstRelevantRank,
  RagEvaluationError,
  recallAtK,
  reciprocalRank,
  scoreCase,
} from '../metrics';

describe('recallAtK', () => {
  it('returns 1 when the relevant result is ranked first', () => {
    expect(recallAtK(['chunk-a', 'chunk-b'], ['chunk-a'], 1)).toBe(1);
    expect(recallAtK(['chunk-a', 'chunk-b'], ['chunk-a'], 5)).toBe(1);
  });

  it('returns 0 when the relevant result is ranked later than k', () => {
    const ranked = ['a', 'b', 'relevant', 'd'];
    expect(recallAtK(ranked, ['relevant'], 1)).toBe(0);
    expect(recallAtK(ranked, ['relevant'], 2)).toBe(0);
    expect(recallAtK(ranked, ['relevant'], 3)).toBe(1);
  });

  it('returns 0 when nothing relevant is retrieved (including an empty retrieval)', () => {
    expect(recallAtK(['a', 'b', 'c'], ['relevant'], 5)).toBe(0);
    expect(recallAtK([], ['relevant'], 5)).toBe(0);
  });

  it('scores multiple relevant results correctly', () => {
    expect(recallAtK(['x', 'rel-1', 'y', 'rel-2'], ['rel-1', 'rel-2'], 2)).toBe(0.5);
    expect(recallAtK(['x', 'rel-1', 'y', 'rel-2'], ['rel-1', 'rel-2'], 4)).toBe(1);
  });

  it('caps at the retrieved list length when k exceeds it', () => {
    expect(recallAtK(['rel-1'], ['rel-1', 'rel-2'], 5)).toBe(0.5);
  });

  it('does not let duplicate retrieved ids inflate recall', () => {
    expect(recallAtK(['rel-1', 'rel-1', 'rel-1'], ['rel-1', 'rel-2'], 3)).toBe(0.5);
  });

  it('throws on an empty expected-relevant list (dataset error, not a score)', () => {
    expect(() => recallAtK(['a', 'b'], [], 5)).toThrow(RagEvaluationError);
    expect(() => recallAtK(['a', 'b'], [], 5)).toThrow(/at least one relevant id/);
  });

  it('throws on invalid k values', () => {
    expect(() => recallAtK(['a'], ['a'], 0)).toThrow(RagEvaluationError);
    expect(() => recallAtK(['a'], ['a'], -3)).toThrow(RagEvaluationError);
    expect(() => recallAtK(['a'], ['a'], 2.5)).toThrow(RagEvaluationError);
  });
});

describe('reciprocalRank / firstRelevantRank', () => {
  it('is 1 when the relevant result is ranked first', () => {
    expect(reciprocalRank(['relevant', 'b'], ['relevant'])).toBe(1);
    expect(firstRelevantRank(['relevant', 'b'], ['relevant'])).toBe(1);
  });

  it('is 1/rank when the relevant result is ranked later', () => {
    expect(reciprocalRank(['a', 'b', 'relevant', 'd'], ['relevant'])).toBe(1 / 3);
    expect(firstRelevantRank(['a', 'b', 'relevant', 'd'], ['relevant'])).toBe(3);
  });

  it('is 0 when nothing relevant is retrieved (including an empty retrieval)', () => {
    expect(reciprocalRank(['a', 'b', 'c'], ['relevant'])).toBe(0);
    expect(firstRelevantRank(['a', 'b', 'c'], ['relevant'])).toBeNull();
    expect(reciprocalRank([], ['relevant'])).toBe(0);
    expect(firstRelevantRank([], ['relevant'])).toBeNull();
  });

  it('uses the FIRST relevant result only', () => {
    expect(reciprocalRank(['a', 'rel-1', 'b', 'rel-2'], ['rel-1', 'rel-2'])).toBe(0.5);
  });
});

describe('evaluateCases (aggregation)', () => {
  it('computes mean recall, MRR, and pass/fail counts across cases', () => {
    const report = evaluateCases(
      [
        { caseId: 'c1', query: 'q1', retrievedIds: ['rel-1'], relevantIds: ['rel-1'] },
        { caseId: 'c2', query: 'q2', retrievedIds: ['x', 'rel-2'], relevantIds: ['rel-2'] },
        { caseId: 'c3', query: 'q3', retrievedIds: ['x', 'y', 'z'], relevantIds: ['rel-3'] },
        {
          caseId: 'c4',
          query: 'q4',
          retrievedIds: ['rel-4a', 'x'],
          relevantIds: ['rel-4a', 'rel-4b'],
        },
      ],
      [1, 2],
    );

    expect(report.totalCases).toBe(4);
    // Recall@1: 1, 0, 0, 0.5 -> 0.375
    expect(report.meanRecallAtK[1]).toBeCloseTo(0.375);
    // Recall@2: 1, 1, 0, 0.5 -> 0.625
    expect(report.meanRecallAtK[2]).toBeCloseTo(0.625);
    // RR: 1, 1/2, 0, 1 -> 0.625
    expect(report.mrr).toBeCloseTo(0.625);
    expect(report.passedCases).toBe(3);
    expect(report.failedCaseIds).toEqual(['c3']);
  });

  it('keeps per-case scores in the report', () => {
    const report = evaluateCases(
      [{ caseId: 'c1', query: 'q', retrievedIds: ['rel'], relevantIds: ['rel'] }],
      [1, 3, 5],
    );
    expect(report.caseScores).toHaveLength(1);
    expect(report.caseScores[0]).toMatchObject({
      caseId: 'c1',
      reciprocalRank: 1,
      firstRelevantRank: 1,
    });
    expect(report.caseScores[0].recallAtK).toEqual({ 1: 1, 3: 1, 5: 1 });
  });

  it('returns zeros for an empty case list', () => {
    const report = evaluateCases([], [1, 3, 5]);
    expect(report.totalCases).toBe(0);
    expect(report.mrr).toBe(0);
    expect(report.meanRecallAtK[5]).toBe(0);
    expect(report.passedCases).toBe(0);
  });

  it('rejects an empty kValues list', () => {
    expect(() => evaluateCases([], [])).toThrow(RagEvaluationError);
  });

  it('normalizes and sorts kValues', () => {
    const score = scoreCase(
      { caseId: 'c', query: 'q', retrievedIds: ['rel'], relevantIds: ['rel'] },
      [5, 1, 3, 1],
    );
    expect(Object.keys(score.recallAtK)).toEqual(['1', '3', '5']);
  });
});

describe('evaluation runner (deterministic lexical baseline)', () => {
  it('ranks the on-topic chunk first for a known query', () => {
    const ranked = rankLexical('How do I change a task priority level?', EVAL_CORPUS, 5);
    expect(ranked[0]).toBe('chunk:tasks-priority');
  });

  it('is fully deterministic: identical input yields identical ranking', () => {
    const query = 'Which roles exist and who can manage team invitations?';
    expect(rankLexical(query, EVAL_CORPUS, 5)).toEqual(rankLexical(query, EVAL_CORPUS, 5));
  });

  it('tokenizes deterministically and filters stopwords', () => {
    expect(tokenize('How do I change a task priority level?')).toEqual([
      'change',
      'task',
      'priority',
      'level',
    ]);
  });

  it('produces a deterministic report over the shipped dataset', () => {
    const first = runEvaluation();
    const second = runEvaluation();
    expect(first).toEqual(second);

    expect(first.totalCases).toBe(EVAL_CASES.length);
    expect(first.kValues).toEqual([1, 3, 5]);
    expect(first.caseScores).toHaveLength(EVAL_CASES.length);
    expect(first.failedCaseIds.length + first.passedCases).toBe(first.totalCases);
  });

  it('reports the deliberate hard case as a miss (honest, not gamed)', () => {
    const report = runEvaluation();
    expect(report.failedCaseIds).toContain('case:presence-wording-gap');
  });

  it('rejects a kValues depth above topK', () => {
    expect(() => runEvaluation(EVAL_CASES, EVAL_CORPUS, 3, [1, 5])).toThrow(
      /must not exceed topK/,
    );
  });

  it('validates dataset integrity', () => {
    const badCase = [
      {
        id: 'case:bad',
        category: 'x',
        query: 'question?',
        expectedRelevantChunkIds: ['chunk:does-not-exist'],
      },
    ];
    expect(() => validateDataset(badCase, EVAL_CORPUS)).toThrow(/does not exist in the corpus/);
    expect(() => validateDataset([], EVAL_CORPUS)).not.toThrow();
  });

  it('rejects a case without expected relevant ids', () => {
    const badCase = [
      {
        id: 'case:bad',
        category: 'x',
        query: 'question?',
        expectedRelevantChunkIds: [],
      },
    ];
    expect(() => validateDataset(badCase, EVAL_CORPUS)).toThrow(/at least one id/);
  });
});
