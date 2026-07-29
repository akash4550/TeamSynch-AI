import {
  Counter,
  Gauge,
} from 'prom-client';

import { metricsRegistry } from './httpMetrics';

export const QUEUE_RESULT_LABEL_NAMES = [
  'queue',
] as const;

export const QUEUE_DEPTH_LABEL_NAMES = [
  'queue',
  'state',
] as const;

export const QUEUE_DEPTH_STATES = [
  'waiting',
  'active',
  'delayed',
  'failed',
] as const;

interface QueueDepthSource {
  name: string;
  getJobCounts(
    ...states: typeof QUEUE_DEPTH_STATES
  ): Promise<Record<string, number>>;
}

export const queueJobsCompletedTotal = new Counter({
  name: 'teamsynch_ai_queue_jobs_completed_total',
  help: 'Total number of successfully completed queue jobs',
  labelNames: QUEUE_RESULT_LABEL_NAMES,
  registers: [metricsRegistry],
});

export const queueJobsFailedTotal = new Counter({
  name: 'teamsynch_ai_queue_jobs_failed_total',
  help: 'Total number of failed queue jobs',
  labelNames: QUEUE_RESULT_LABEL_NAMES,
  registers: [metricsRegistry],
});

export const queueDepth = new Gauge({
  name: 'teamsynch_ai_queue_depth',
  help: 'Current number of queue jobs by state',
  labelNames: QUEUE_DEPTH_LABEL_NAMES,
  registers: [metricsRegistry],
});

export function recordQueueJobCompleted(queue: string): void {
  queueJobsCompletedTotal.inc({ queue });
}

export function recordQueueJobFailed(queue: string): void {
  queueJobsFailedTotal.inc({ queue });
}

export async function collectQueueDepths(
  queues: QueueDepthSource[],
): Promise<void> {
  queueDepth.reset();

  await Promise.all(
    queues.map(async queue => {
      const counts = await queue.getJobCounts(
        ...QUEUE_DEPTH_STATES,
      );

      QUEUE_DEPTH_STATES.forEach(state => {
        queueDepth.set(
          {
            queue: queue.name,
            state,
          },
          counts[state] ?? 0,
        );
      });
    }),
  );
}
