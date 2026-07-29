import { EntitlementService } from '../entitlement.service';
import { prisma } from '../../../config/prisma';

jest.mock('../../../config/prisma', () => ({
  prisma: {
    organization: {
      findFirst: jest.fn(),
    },
    user: {
      count: jest.fn(),
    },
    project: {
      count: jest.fn(),
    },
    aIUsageLog: {
      count: jest.fn(),
    },
    document: {
      aggregate: jest.fn(),
    },
  },
}));

describe('EntitlementService', () => {
  let service: EntitlementService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new EntitlementService();
  });

  describe('checkEntitlement', () => {
    it('allows action when organization is within plan quotas', async () => {
      (prisma.organization.findFirst as jest.Mock).mockResolvedValue({
        id: 'org-1',
        name: 'Test Org',
        plan: 'FREE',
        subscriptionStatus: 'ACTIVE',
      });

      (prisma.project.count as jest.Mock).mockResolvedValue(1); // 1 out of 3 max

      await expect(service.checkEntitlement('org-1', 'PROJECT')).resolves.not.toThrow();
    });

    it('rejects creation with 402 Payment Required when subscription is PAST_DUE', async () => {
      (prisma.organization.findFirst as jest.Mock).mockResolvedValue({
        id: 'org-1',
        name: 'Test Org',
        plan: 'PRO',
        subscriptionStatus: 'PAST_DUE',
      });

      await expect(service.checkEntitlement('org-1', 'PROJECT')).rejects.toMatchObject({
        statusCode: 402,
        message: expect.stringContaining('Payment Required'),
      });
    });

    it('rejects creation when numerical user quota is exceeded', async () => {
      (prisma.organization.findFirst as jest.Mock).mockResolvedValue({
        id: 'org-1',
        name: 'Test Org',
        plan: 'FREE',
        subscriptionStatus: 'ACTIVE',
      });

      (prisma.user.count as jest.Mock).mockResolvedValue(5); // 5 out of 5 max

      await expect(service.checkEntitlement('org-1', 'USER')).rejects.toMatchObject({
        statusCode: 403,
        message: expect.stringContaining('Plan quota exceeded'),
      });
    });
  });

  describe('getSubscriptionUsage', () => {
    it('returns calculated usage statistics and percentage metrics', async () => {
      (prisma.organization.findFirst as jest.Mock).mockResolvedValue({
        id: 'org-1',
        name: 'Test Org',
        plan: 'PRO',
        subscriptionStatus: 'ACTIVE',
      });

      (prisma.user.count as jest.Mock).mockResolvedValue(10);
      (prisma.project.count as jest.Mock).mockResolvedValue(20);
      (prisma.aIUsageLog.count as jest.Mock).mockResolvedValue(100);
      (prisma.document.aggregate as jest.Mock).mockResolvedValue({
        _sum: { fileSize: 10485760 }, // 1 MB
      });

      const usage = await service.getSubscriptionUsage('org-1');

      expect(usage.plan).toBe('PRO');
      expect(usage.subscriptionStatus).toBe('ACTIVE');
      expect(usage.usage.users.current).toBe(10);
      expect(usage.usage.projects.current).toBe(20);
    });
  });
});
