import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';

import rateLimit from 'express-rate-limit';
import { errorMiddleware } from './core/middlewares/errorMiddleware';

import organizationRoutes from './modules/organization/organization.routes';
import userRoutes from './modules/user/user.routes';
import taskRoutes from './modules/tasks/task.routes';
import teamRoutes from './modules/teams/team.routes';
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
import { requestObservability } from './core/middlewares/requestObservability';
import { BillingController } from './modules/billing/billing.controller';
import { asyncWrapper } from './core/utils/asyncWrapper';

const app: Application = express();

if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}
app.use(requestObservability);
app.use(helmet());

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' }
});
app.use('/api/', apiLimiter);

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

const swaggerSpec = swaggerJsdoc(swaggerOptions);
app.use('/api/v1/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.use('/api/v1/system', systemRoutes);

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/organizations', organizationRoutes);
app.use('/api/v1/projects', projectRoutes);
app.use('/api/v1/tasks', taskRoutes);
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
app.use('/api/v1/calendar', calendarRoutes);
app.use('/api/v1/billing', billingRoutes);
app.use('/api/v1/audit', auditRoutes);

app.use(errorMiddleware);

export default app;
