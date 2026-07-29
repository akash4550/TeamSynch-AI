import { Worker } from 'bullmq';
import { getRedisClient } from '../../../core/redis/redis.client';
import { QUEUE_NAMES } from '../queues';
import {
  recordQueueJobCompleted,
  recordQueueJobFailed,
} from '../../../core/metrics/queueMetrics';

import { emailProcessor } from '../processors/email.processor';
import { notificationProcessor } from '../processors/notification.processor';
import { analyticsProcessor } from '../processors/analytics.processor';
import { aiProcessor } from '../processors/ai.processor';

export const startWorkers = () => {
  try {
    const connection = getRedisClient();

    const workerOptions = {
      connection,
      concurrency: parseInt(process.env.WORKER_CONCURRENCY || '5', 10),
    };

    console.log('Starting BullMQ background workers...');

    const emailWorker = new Worker(QUEUE_NAMES.EMAIL, emailProcessor, workerOptions);
    const notificationWorker = new Worker(QUEUE_NAMES.NOTIFICATIONS, notificationProcessor, workerOptions);
    const analyticsWorker = new Worker(QUEUE_NAMES.ANALYTICS, analyticsProcessor, workerOptions);
    const aiWorker = new Worker(QUEUE_NAMES.AI, aiProcessor, workerOptions);

    const workers = [emailWorker, notificationWorker, analyticsWorker, aiWorker];

    workers.forEach(worker => {
      worker.on('completed', job => {
        recordQueueJobCompleted(worker.name);
        console.log(`Job ${job.id} of type ${job.name} completed successfully.`);
      });

      worker.on('failed', (job, err) => {
        recordQueueJobFailed(worker.name);
        console.error(`Job ${job?.id} of type ${job?.name} failed with error: ${err.message}`);
      });

      worker.on('error', err => {
        console.warn(`[Worker:${worker.name}] Redis connection error: ${err.message}`);
      });
    });

    return workers;
  } catch (error: any) {
    console.warn('[Workers] Redis is offline. Background workers will connect automatically when Redis starts.', error.message);
    return [];
  }
};

export const stopWorkers = async (workers: Worker[]) => {
  console.log('Shutting down background workers gracefully...');
  await Promise.all(workers.map(worker => worker.close()));
};
