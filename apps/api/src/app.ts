import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';

import rateLimit from 'express-rate-limit';
import { errorMiddleware } from './core/middlewares/errorMiddleware';
import { signedDownloadHandler } from './core/storage/signedDownloads';

import organizationRoutes from './modules/organization/organization.routes';
import userRoutes from './modules/user/user.routes';
import taskRoutes from './modules/tasks/task.routes';
import teamRoutes from './modules/teams/team.routes';
import teamPublicRoutes from './modules/teams/team.public.routes';
import documentRoutes from './modules/documents/document.routes';
import clientRoutes from './modules/crm/clients/client.routes';
import contactRoutes from './modules/crm/contacts/contact.routes';
import leadRoutes from './modules/crm/leads/lead.routes';
import opportunityRoutes from './modules/crm/opportunities/opportunity.routes';
import crmPipelineRoutes from './modules/crm/pipeline/crm-pipeline.routes';
import pipelineRoutes from './modules/crm/pipeline/pipeline.routes';
import activityRoutes from './modules/crm/activities/activity.routes';
import analyticsRoutes from './modules/analytics/analytics.routes';
import jobsRoutes from './modules/jobs/jobs.routes';
import notificationRoutes from './modules/notifications/notification.routes';
import calendarRoutes from './modules/calendar/calendar.routes';
import calendarPublicRoutes from './modules/calendar/calendar.public.routes';
import billingRoutes from './modules/billing/billing.routes';
import auditRoutes from './modules/audit/audit.routes';
import swaggerUi from 'swagger-ui-express';
import swaggerJsdoc from 'swagger-jsdoc';
import { startWorkers } from './modules/jobs/workers';
import { startScheduler } from './modules/jobs/scheduler';
import projectRoutes from './modules/projects/project.routes';
import systemRoutes from './modules/system/system.routes';
import aiRoutes from './modules/ai/ai.routes';
import searchRoutes from './modules/search/search.routes';
import authRoutes from './modules/auth/auth.routes';
import { env } from './config/env';
import { shouldExposeApiDocs } from './config/api-docs-gate'; // FEATURE (ledger #17)
import { logger } from './core/utils/logger';
import { requestObservability } from './core/middlewares/requestObservability';
import { BillingController } from './modules/billing/billing.controller';
import { asyncWrapper } from './core/utils/asyncWrapper';

const app: Application = express();

if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}
app.use(requestObservability);
app.use(helmet());

/*
 * BUG FIX (#45 — global rate limit sized below normal SPA usage): the
 * shared 100-requests/15-min/IP budget covered EVERY /api/* call. A single
 * active user easily exceeds that: each view fires several React-Query
 * requests (projects, tasks, notifications, metrics…) and the default
 * refetchOnWindowFocus re-fires all of them on every tab focus — a few
 * hundred calls per 15 minutes is ordinary, and colleagues behind one
 * office NAT share the same IP budget. Reproduced with the real app
 * mounted: request #101 to any API route returns HTTP 429, so the whole
 * product stalls mid-session. The budget is raised to 1000 (≈1.1 rps
 * sustained — ample for real usage, still flood-proof). Note the mirror
 * hazard this creates: /auth/login previously borrowed brute-force
 * protection from the tight global cap, so the new dedicated authLimiter
 * below restores (and strengthens) that defense at 20 attempts/15 min,
 * alongside the per-account lockout in auth.service.
 */
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' }
});
app.use('/api/', apiLimiter);

/*
 * Part of BUG FIX #45: dedicated brute-force cap for the credential
 * endpoints (login/refresh/logout). Deliberately far tighter than the
 * general API budget and independent of it, so heavy normal API usage can
 * never exhaust it, and an auth flood never throttles the rest of the app.
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts, please try again later.' }
});
app.use('/api/v1/auth/', authLimiter);

app.use(cors({
  origin: env.FRONTEND_URL,
  credentials: true,
}));

// Mount Stripe Webhook with raw Buffer parsing BEFORE express.json()
const billingController = new BillingController();
app.post(
  '/api/v1/billing/webhook',
  express.raw({ type: 'application/json' }),
  asyncWrapper(billingController.handleWebhook.bind(billingController))
);

app.use(express.json());

app.get('/health', (req: Request, res: Response) => {
    res.status(200).json({ status: 'ok', message: 'API is healthy' });
});

if (process.env.NODE_ENV !== 'test') {
  startWorkers();
  startScheduler();
}

const swaggerOptions = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'TeamSynch AI API',
            version: '1.0.0',
            description: 'API documentation for TeamSynch AI CRM and modules',
        },
        components: {
            securitySchemes: {
                bearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT',
                },
            },
        },
        security: [{ bearerAuth: [] }],
    },
    apis: [
      path.join(__dirname, './modules/**/*.routes.ts'),
      path.join(__dirname, './modules/**/*.routes.js'),
      './src/modules/**/*.routes.ts',
      './apps/api/src/modules/**/*.routes.ts',
    ],
};

/*
 * FEATURE (ledger #17 — 2026-08-06, approved pick): the docs mount is now
 * GATED, not unconditional. Previously the swagger UI (a full route-map
 * disclosure of every annotated endpoint) was served unauthenticated in
 * all environments — production included — a disclosure surface nobody
 * decided on. The gate (config/api-docs-gate.ts): explicit
 * ENABLE_API_DOCS=true/false wins in every environment; unset mounts
 * outside production and withholds the UI in production. When disabled:
 * the spec is never generated (no boot cost), the mount never happens,
 * and /api/v1/docs/* falls through to the standard unmatched-route 404
 * envelope with its existing metrics label — no special-case surface.
 */
if (shouldExposeApiDocs(env.NODE_ENV, env.ENABLE_API_DOCS)) {
  const swaggerSpec = swaggerJsdoc(swaggerOptions);
  app.use('/api/v1/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
  logger.info('[App] API docs UI mounted at /api/v1/docs (ENABLE_API_DOCS policy resolved to expose)');
} else {
  logger.info(
    '[App] API docs UI disabled (secure-by-default: unset in production — set ENABLE_API_DOCS=true to expose it intentionally)',
  );
}

app.use('/api/v1/system', systemRoutes);

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/organizations', organizationRoutes);
app.use('/api/v1/projects', projectRoutes);
app.use('/api/v1/tasks', taskRoutes);
/*
 * FEATURE (ledger #1 — invitation accept lifecycle): token-carrying
 * public routes (GET/POST /teams/invitations/:token...) mounted FIRST —
 * they must not cross requireAuth or the authed router's '/:id' shadow;
 * every other /teams path falls through to teamRoutes unchanged.
 */
app.use('/api/v1/teams', teamPublicRoutes);
app.use('/api/v1/teams', teamRoutes);
app.use('/api/v1/documents', documentRoutes);
app.use('/api/v1/crm/clients', clientRoutes);
app.use('/api/v1/crm/contacts', contactRoutes);
app.use('/api/v1/crm/leads', leadRoutes);
app.use('/api/v1/crm/opportunities', opportunityRoutes);
app.use('/api/v1/crm/pipeline-stages', crmPipelineRoutes);
app.use('/api/v1/crm/pipeline-stages', pipelineRoutes);
app.use('/api/v1/crm/activities', activityRoutes);
app.use('/api/v1/analytics', analyticsRoutes);
app.use('/api/v1/jobs', jobsRoutes);
app.use('/api/v1/ai', aiRoutes);
app.use('/api/v1/search', searchRoutes);
app.use('/api/v1/notifications', notificationRoutes);
// FEATURE (ledger #3): browser-delivered OAuth callback — public mount
// FIRST (verified HMAC state is the credential); all other /calendar
// paths fall through to the authenticated router unchanged.
app.use('/api/v1/calendar', calendarPublicRoutes);
app.use('/api/v1/calendar', calendarRoutes);
app.use('/api/v1/billing', billingRoutes);
app.use('/api/v1/audit', auditRoutes);

/*
 * BUG FIX (#64): serve local storage downloads — HMAC-gated only (see
 * core/storage/signedDownloads.ts). Every signed URL document.service and
 * the audit-export processor hand out resolves here; before this mount the
 * URLs (document viewer, version downloads, compliance CSV export) 404'd
 * 100% of the time. Sits under the global /api rate limiter (line ~72).
 */
app.use('/api/v1/uploads', signedDownloadHandler);

/*
 * RELEASE FIX (round 9 — 2026-08-07): unmatched routes previously fell
 * through to Express's DEFAULT HTML "Cannot GET ..." page — the only
 * non-JSON surface in the API, and a direct contradiction of the
 * api-docs-gate's promised "standard unmatched-route 404 envelope". This
 * terminal handler emits that envelope (same shape fields as
 * errorMiddleware, minus the error object internals). Path echo excludes
 * the query string on purpose: signed URLs carry HMAC query params that
 * have no reason to bounce back in a body.
 */
app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    requestId: req.requestId,
    error: { message: `Not found: ${req.method} ${req.path}` },
  });
});

app.use(errorMiddleware);

export default app;
