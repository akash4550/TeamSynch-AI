export type PlanTier = 'FREE' | 'STARTER' | 'PRO' | 'BUSINESS';

export interface PlanQuotas {
  maxUsers: number;
  maxProjects: number;
  maxStorageMb: number;
  maxAiRequestsPerMonth: number;
}

export const PLAN_CONFIG: Record<string, PlanQuotas> = {
  FREE: {
    maxUsers: 5,
    maxProjects: 3,
    maxStorageMb: 500,
    maxAiRequestsPerMonth: 50,
  },
  STARTER: {
    maxUsers: 15,
    maxProjects: 15,
    maxStorageMb: 5000,
    maxAiRequestsPerMonth: 500,
  },
  PRO: {
    maxUsers: 50,
    maxProjects: 100,
    maxStorageMb: 50000,
    maxAiRequestsPerMonth: 5000,
  },
  BUSINESS: {
    maxUsers: 500,
    maxProjects: 1000,
    maxStorageMb: 500000,
    maxAiRequestsPerMonth: 50000,
  },
};
