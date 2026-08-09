import { Router } from 'express';
import { SystemController } from './system.controller';
import { Role } from '@prisma/client';
import { requireAuth } from '../../core/middlewares/authMiddleware';
import { requireRole } from '../../core/middlewares/rbacMiddleware';

const router = Router();
const controller = new SystemController();

/**
 * @swagger
 * /system/live:
 *   get:
 *     summary: Liveness probe
 *     tags: [System]
 */
router.get('/live', controller.checkLiveness.bind(controller));

/**
 * @swagger
 * /system/ready:
 *   get:
 *     summary: Readiness probe (Checks DB/Redis)
 *     tags: [System]
 */
router.get('/ready', controller.checkReadiness.bind(controller));

// Prometheus metrics endpoint (Super Admin only)
router.get(
  '/metrics',
  requireAuth,
  requireRole(Role.SUPER_ADMIN),
  controller.getMetrics.bind(controller)
);

// Platform-wide AI usage summary (Super Admin only — operator view of
// total AI spend across all organizations; see analytics/ai-usage).
router.get(
  '/ai-usage',
  requireAuth,
  requireRole(Role.SUPER_ADMIN),
  controller.getPlatformAIUsage.bind(controller)
);

// Alias for general health
router.get('/health', controller.checkReadiness.bind(controller));

export default router;