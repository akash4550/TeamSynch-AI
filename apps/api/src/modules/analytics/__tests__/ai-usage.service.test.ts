import { prisma } from '../../../config/prisma';
import { AIUsageService } from '../ai-usage.service';
import { AI_USAGE_DEFAULT_DAYS, AI_USAGE_MAX_DAYS } from '../ai-usage.dto';

jest.mock('../../../config/prisma', () => ({
  prisma: {
    aIUsageLog: {
      aggregate: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn(),
    },
  },
}));

describe('AIUsageService', () => {
  const aggregateMock = prisma.aIUsageLog.aggregate as jest.Mock;
  const countMock = prisma.aIUsageLog.count as jest.Mock;
  const groupByMock = prisma.aIUsageLog.groupBy as jest.Mock;
  const service = new AIUsageService();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const emptyTotals = {
    _count: { _all: 0 },
    _sum: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    _avg: { latencyMs: null },
  };

  it('returns zeros for an empty period', async () => {
    aggregateMock.mockResolvedValue(emptyTotals);
    countMock.mockResolvedValue(0);
    groupByMock.mockResolvedValue([]);

    const summary = await service.getAIUsageSummary('org-1');

    expect(summary.totalRequests).toBe(0);
    expect(summary.successRate).toBe(0);
    expect(summary.totalTokens).toBe(0);
    expect(summary.requestsByFeature).toEqual([]);
    expect(summary.requestsByProvider).toEqual([]);
    expect(summary.organizationId).toBe('org-1');
    expect(summary.periodDays).toBe(AI_USAGE_DEFAULT_DAYS);
  });

  it('scopes every query by organizationId and the trailing window', async () => {
    aggregateMock.mockResolvedValue(emptyTotals);
    countMock.mockResolvedValue(0);
    groupByMock.mockResolvedValue([]);

    await service.getAIUsageSummary('org-42', 7);

    expect(aggregateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId: 'org-42',
          createdAt: expect.objectContaining({ gte: expect.any(Date) }),
        },
      }),
    );
    expect(countMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId: 'org-42',
          createdAt: expect.objectContaining({ gte: expect.any(Date) }),
          success: true,
        },
      }),
    );
    // groupBy called 4x (feature all/success, provider all/success), all
    // org-scoped.
    for (const call of groupByMock.mock.calls) {
      expect(call[0].where.organizationId).toBe('org-42');
    }
  });

  it('merges per-feature success/failure counts, tokens, and latency', async () => {
    aggregateMock.mockResolvedValue({
      _count: { _all: 4 },
      _sum: { promptTokens: 40, completionTokens: 20, totalTokens: 60 },
      _avg: { latencyMs: 250 },
    });
    countMock.mockResolvedValue(3);

    const featureRows = [
      {
        feature: 'RAG_WORKSPACE_CHAT',
        _count: { _all: 3 },
        _sum: { totalTokens: 50 },
        _avg: { latencyMs: 300 },
      },
      {
        feature: 'TASK_SUMMARY',
        _count: { _all: 1 },
        _sum: { totalTokens: 10 },
        _avg: { latencyMs: 100 },
      },
    ];
    const successRows = [
      {
        feature: 'RAG_WORKSPACE_CHAT',
        _count: { _all: 2 },
      },
    ];
    const providerAll = [
      { provider: 'OPENAI', _count: { _all: 4 } },
    ];
    const providerSuccess = [
      { provider: 'OPENAI', _count: { _all: 3 } },
    ];

    // groupBy is called 4 times: feature all, feature success, provider
    // all, provider success — in that order.
    groupByMock
      .mockResolvedValueOnce(featureRows)
      .mockResolvedValueOnce(successRows)
      .mockResolvedValueOnce(providerAll)
      .mockResolvedValueOnce(providerSuccess);

    const summary = await service.getAIUsageSummary('org-1');

    expect(summary.totalRequests).toBe(4);
    expect(summary.successfulRequests).toBe(3);
    expect(summary.failedRequests).toBe(1);
    expect(summary.successRate).toBe(0.75);
    expect(summary.totalTokens).toBe(60);
    expect(summary.averageLatencyMs).toBe(250);

    expect(summary.requestsByFeature).toEqual([
      {
        feature: 'RAG_WORKSPACE_CHAT',
        requests: 3,
        successes: 2,
        failures: 1,
        totalTokens: 50,
        averageLatencyMs: 300,
      },
      {
        feature: 'TASK_SUMMARY',
        requests: 1,
        successes: 0,
        failures: 1,
        totalTokens: 10,
        averageLatencyMs: 100,
      },
    ]);
    expect(summary.requestsByProvider).toEqual([
      { provider: 'OPENAI', requests: 4, successes: 3, failures: 1 },
    ]);
  });

  it('sorts features and providers by request count descending', async () => {
    aggregateMock.mockResolvedValue(emptyTotals);
    countMock.mockResolvedValue(0);
    groupByMock
      .mockResolvedValueOnce([
        { feature: 'A', _count: { _all: 1 }, _sum: { totalTokens: 0 }, _avg: { latencyMs: null } },
        { feature: 'B', _count: { _all: 5 }, _sum: { totalTokens: 0 }, _avg: { latencyMs: null } },
        { feature: 'C', _count: { _all: 3 }, _sum: { totalTokens: 0 }, _avg: { latencyMs: null } },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { provider: 'MOCK', _count: { _all: 2 } },
        { provider: 'OPENAI', _count: { _all: 9 } },
      ])
      .mockResolvedValueOnce([]);

    const summary = await service.getAIUsageSummary('org-1');

    expect(summary.requestsByFeature.map((f) => f.feature)).toEqual(['B', 'C', 'A']);
    expect(summary.requestsByProvider.map((p) => p.provider)).toEqual(['OPENAI', 'MOCK']);
  });

  it('clamps the period to the documented bounds', async () => {
    aggregateMock.mockResolvedValue(emptyTotals);
    countMock.mockResolvedValue(0);
    groupByMock.mockResolvedValue([]);

    const tooBig = await service.getAIUsageSummary('org-1', 9999);
    expect(tooBig.periodDays).toBe(AI_USAGE_MAX_DAYS);

    const tooSmall = await service.getAIUsageSummary('org-1', 0);
    expect(tooSmall.periodDays).toBe(1);

    const invalid = await service.getAIUsageSummary('org-1', NaN);
    expect(invalid.periodDays).toBe(AI_USAGE_DEFAULT_DAYS);
  });
});
