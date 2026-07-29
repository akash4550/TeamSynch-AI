import { Queue, QueueOptions } from 'bullmq';
import { getRedisClient } from '../../../core/redis/redis.client';
import { BaseJobData } from '../services/job.service';

export const QUEUE_NAMES = {
  EMAIL: 'emailQueue',
  NOTIFICATIONS: 'notificationsQueue',
  DOCUMENTS: 'documentsQueue',
  ANALYTICS: 'analyticsQueue',
  CRM: 'crmQueue',
  AI: 'aiQueue',
  MAINTENANCE: 'maintenanceQueue'
};

/**
 * Tenant Job Validator enforcing multi-tenant metadata isolation on background tasks
 */
export function validateTenantJobData<T extends BaseJobData>(data: T): T {
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid job payload: payload must be a non-null object');
  }

  if (!data.organizationId || typeof data.organizationId !== 'string') {
    throw new Error('Tenant isolation error: Missing or invalid organizationId in job payload');
  }

  return data;
}

const connection = getRedisClient();

/**
 * Strictly namespaced BullMQ queue configuration with cluster hashtag prefixing
 */
const defaultQueueOptions: QueueOptions = {
  connection,
  prefix: '{teamsynch-ai}', // Redis cluster hashtag key namespacing
  defaultJobOptions: {
    removeOnComplete: true,
    removeOnFail: false,
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
  },
};

export const emailQueue = new Queue(QUEUE_NAMES.EMAIL, defaultQueueOptions);
export const notificationsQueue = new Queue(QUEUE_NAMES.NOTIFICATIONS, defaultQueueOptions);
export const documentsQueue = new Queue(QUEUE_NAMES.DOCUMENTS, defaultQueueOptions);
export const analyticsQueue = new Queue(QUEUE_NAMES.ANALYTICS, defaultQueueOptions);
export const crmQueue = new Queue(QUEUE_NAMES.CRM, defaultQueueOptions);
export const aiQueue = new Queue(QUEUE_NAMES.AI, defaultQueueOptions);
export const maintenanceQueue = new Queue(QUEUE_NAMES.MAINTENANCE, defaultQueueOptions);

export const allQueues = [
  emailQueue,
  notificationsQueue,
  documentsQueue,
  analyticsQueue,
  crmQueue,
  aiQueue,
  maintenanceQueue
];
