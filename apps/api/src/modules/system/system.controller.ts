import { Request, Response } from 'express';
import { env } from '../../config/env';
import { prisma } from '../../config/prisma';
import { getRedisClient } from '../../core/redis/redis.client';
import { logger } from '../../core/utils/logger';
import { metricsRegistry } from '../../core/metrics/httpMetrics';
import { collectQueueDepths } from '../../core/metrics/queueMetrics';
import { observeDependencyCheck } from '../../core/metrics/dependencyMetrics';
import { allQueues } from '../jobs/queues';
import { AIUsageService } from '../analytics/ai-usage.service';
export class SystemController {

  private aiUsageService = new AIUsageService();

  
  /**
   * Liveness Probe: Returns 200 OK immediately if the HTTP server is accepting requests.
   * Kubernetes uses this to know if it should restart the pod.
   */
  checkLiveness(req: Request, res: Response) {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
  }

  /**
   * Readiness Probe: Checks if the application is ready to accept traffic.
   * Kubernetes uses this to know if it should send traffic to this pod.
   * We check DB and Redis connectivity here.
   */
  async checkReadiness(req: Request, res: Response) {
    try {
      // Check Postgres
      await observeDependencyCheck(
  'postgres',
  async () => prisma.$queryRaw`SELECT 1`,
);
      
      // Check Redis
      const redis = getRedisClient();
      await observeDependencyCheck(
  'redis',
  async () => redis.ping(),
);

      res.status(200).json({
        status: 'ready',
        database: 'connected',
        redis: 'connected',
               ai: {
          provider: env.AI_PROVIDER,
          model:
            env.AI_MODEL ??
            (env.AI_PROVIDER === 'MOCK'
              ? 'mock-model-v1'
              : 'unconfigured'),
          configured:
            env.AI_PROVIDER === 'MOCK' ||
            Boolean(env.AI_MODEL && env.OPENAI_API_KEY),
        },
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      logger.error('Readiness check failed', { error: error.message });
      res.status(503).json({
        status: 'unavailable',
        error: 'Service dependencies are unavailable',
        timestamp: new Date().toISOString()
      });
    }
  }
async getMetrics(req: Request, res: Response) {
  res.set('Content-Type', metricsRegistry.contentType);
  await collectQueueDepths(allQueues);
  const metrics = await metricsRegistry.metrics();
  res.status(200).send(metrics);
}

  /**
   * Platform-wide AI usage summary (Super Admin only). Complements the
   * org-scoped analytics endpoint with the operator view: total platform
   * spend and a per-organization breakdown over the trailing window.
   */
  async getPlatformAIUsage(req: Request, res: Response) {
    const daysRaw = req.query.days;
    const days =
      typeof daysRaw === 'string' && daysRaw.trim() !== ''
        ? Number(daysRaw)
        : undefined;

    const summary = await this.aiUsageService.getPlatformAIUsageSummary(days);

    res.status(200).json({ data: summary });
  }
}
