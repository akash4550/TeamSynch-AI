import { Router } from 'express';
import { JobsController } from './jobs.controller';
import { requireRole } from '../../core/middlewares/rbacMiddleware';
import { requireAuth } from '../../core/middlewares/authMiddleware';
import { Role } from '@prisma/client';

const router = Router();
const controller = new JobsController();

/*
 * BUG FIX (Bug #44 — jobs router mounted role guard WITHOUT requireAuth):
 * `requireRole`/`requirePermission` only INSPECT `req.user`; the JWT is
 * verified and `req.user` populated exclusively by `requireAuth`. This
 * router ran `router.use(requireRole(Role.SUPER_ADMIN))` with no
 * `requireAuth` anywhere in its chain (the only router in the codebase
 * with guards but no auth — verified by sweep), so `req.user` was ALWAYS
 * undefined and every request to /api/v1/jobs/* was rejected with
 * 401 'Unauthorized' — including legitimate SUPER_ADMINs presenting valid
 * Bearer tokens. The entire Background Jobs console (queue status, failed
 * jobs, retry) was dead in production: the web JobsDashboard's three
 * queries (useJobs.ts) received a permanent 401 wall. Reproduced with the
 * real router mounted: SUPER_ADMIN + valid token → HTTP 401 on
 * /status, /failed/:queueName and /retry. The fix mirrors the pattern used
 * by every other router (and system.routes.ts's `requireAuth, requireRole`
 * pairing): authenticate first, THEN evaluate the role.
 */
router.use(requireAuth);
// All job queue endpoints are strictly administrative
router.use(requireRole(Role.SUPER_ADMIN));

/**
 * @swagger
 * tags:
 *   name: Jobs
 *   description: Background job queue administration
 */

/**
 * @swagger
 * /jobs/status:
 *   get:
 *     summary: Get status of all background queues
 *     tags: [Jobs]
 *     responses:
 *       200:
 *         description: Array of queue statuses and counts
 */
router.get('/status', controller.getQueueStatus.bind(controller));

/**
 * @swagger
 * /jobs/retry:
 *   post:
 *     summary: Retry all failed jobs in a specific queue
 *     tags: [Jobs]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               queueName:
 *                 type: string
 *     responses:
 *       200:
 *         description: Number of jobs retried
 */
router.post('/retry', controller.retryFailedJobs.bind(controller));

/**
 * @swagger
 * /jobs/failed/{queueName}:
 *   get:
 *     summary: Get recent failed jobs for a specific queue
 *     tags: [Jobs]
 *     parameters:
 *       - in: path
 *         name: queueName
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Array of failed jobs with stacktraces
 */
router.get('/failed/:queueName', controller.getFailedJobs.bind(controller));

/**
 * @swagger
 * /jobs/{id}:
 *   get:
 *     summary: Get the live status of a single background job by id
 *     description: Status endpoint for the checkStatusUrl returned by the async AI, audit-export and calendar-sync producers. BullMQ ids are unique per queue, so every registered queue is probed.
 *     tags: [Jobs]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Job status and lifecycle metadata
 *       404:
 *         description: Job not found in any queue
 */
// BUG FIX (#57): this catch-all ':id' GET is registered LAST so it can
// never shadow the static /status and /failed/:queueName GETs declared
// above — Express matches routes in registration order.
router.get('/:id', controller.getJobById.bind(controller));

export default router;
