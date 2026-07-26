import { prisma } from '../../config/prisma';
import { AppError } from '../../core/errors/AppError';
import { PLAN_CONFIG, PlanQuotas } from './plans.config';

export type EntitlementFeature = 'USER' | 'PROJECT' | 'AI_REQUEST';

export interface SubscriptionStatusResponse {
  plan: string;
  subscriptionStatus: string;
  quotas: PlanQuotas;
  usage: {
    users: { current: number; max: number; percentage: number };
    projects: { current: number; max: number; percentage: number };
    aiRequests: { current: number; max: number; percentage: number };
    storageMb: { current: number; max: number; percentage: number };
  };
}

export class EntitlementService {
  async getOrganizationPlanQuotas(organizationId: string): Promise<{ plan: string; quotas: PlanQuotas; org: any }> {
    const org = await prisma.organization.findFirst({
      where: { id: organizationId, deletedAt: null, isActive: true },
      select: { id: true, name: true, plan: true, subscriptionStatus: true },
    });

    if (!org) {
      throw new AppError('Organization not found or inactive', 404);
    }

    const planKey = (org.plan || 'FREE').toUpperCase();
    const quotas = PLAN_CONFIG[planKey] || PLAN_CONFIG.FREE;

    return { plan: planKey, quotas, org };
  }

  /**
   * Asserts subscription status & quota limits before resource creation.
   * Throws HTTP 402 Payment Required if subscription status is PAST_DUE, CANCELED, or UNPAID.
   */
  async checkEntitlement(organizationId: string, feature: EntitlementFeature): Promise<void> {
    const { quotas, org } = await this.getOrganizationPlanQuotas(organizationId);

    const subStatus = (org.subscriptionStatus || 'ACTIVE').toUpperCase();
    if (['PAST_DUE', 'CANCELED', 'UNPAID'].includes(subStatus)) {
      throw new AppError(
        'Payment Required: Your organization subscription is past due or canceled. Please update your billing method.',
        402
      );
    }

    if (feature === 'USER') {
      const activeUsers = await prisma.user.count({
        where: { organizationId, deletedAt: null, isActive: true },
      });

      if (activeUsers >= quotas.maxUsers) {
        throw new AppError(
          `Plan quota exceeded: Current plan allows max ${quotas.maxUsers} users. Please upgrade your subscription.`,
          403
        );
      }
    } else if (feature === 'PROJECT') {
      const activeProjects = await prisma.project.count({
        where: { organizationId, deletedAt: null },
      });

      if (activeProjects >= quotas.maxProjects) {
        throw new AppError(
          `Plan quota exceeded: Current plan allows max ${quotas.maxProjects} projects. Please upgrade your subscription.`,
          403
        );
      }
    } else if (feature === 'AI_REQUEST') {
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const monthlyAiRequests = await prisma.aIUsageLog.count({
        where: { organizationId, createdAt: { gte: startOfMonth } },
      });

      if (monthlyAiRequests >= quotas.maxAiRequestsPerMonth) {
        throw new AppError(
          `Plan quota exceeded: Monthly limit of ${quotas.maxAiRequestsPerMonth} AI requests reached. Please upgrade your subscription.`,
          403
        );
      }
    }
  }

  async getSubscriptionUsage(organizationId: string): Promise<SubscriptionStatusResponse> {
    const { plan, quotas, org } = await this.getOrganizationPlanQuotas(organizationId);

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const [currentUsers, currentProjects, currentAiRequests, documentAggregation] = await Promise.all([
      prisma.user.count({ where: { organizationId, deletedAt: null, isActive: true } }),
      prisma.project.count({ where: { organizationId, deletedAt: null } }),
      prisma.aIUsageLog.count({ where: { organizationId, createdAt: { gte: startOfMonth } } }),
      prisma.document.aggregate({
        where: { organizationId, deletedAt: null },
        _sum: { fileSize: true },
      }),
    ]);

    const totalBytes = Number(documentAggregation._sum.fileSize || 0);
    const currentStorageMb = Math.round(totalBytes / (1024 * 1024));

    return {
      plan,
      subscriptionStatus: org.subscriptionStatus || 'ACTIVE',
      quotas,
      usage: {
        users: {
          current: currentUsers,
          max: quotas.maxUsers,
          percentage: Math.min(100, Math.round((currentUsers / quotas.maxUsers) * 100)),
        },
        projects: {
          current: currentProjects,
          max: quotas.maxProjects,
          percentage: Math.min(100, Math.round((currentProjects / quotas.maxProjects) * 100)),
        },
        aiRequests: {
          current: currentAiRequests,
          max: quotas.maxAiRequestsPerMonth,
          percentage: Math.min(100, Math.round((currentAiRequests / quotas.maxAiRequestsPerMonth) * 100)),
        },
        storageMb: {
          current: currentStorageMb,
          max: quotas.maxStorageMb,
          percentage: Math.min(100, Math.round((currentStorageMb / quotas.maxStorageMb) * 100)),
        },
      },
    };
  }
}
