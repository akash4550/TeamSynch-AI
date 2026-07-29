import { metricsRegistry } from '../httpMetrics';
import {
  QUEUE_DEPTH_LABEL_NAMES,
  QUEUE_DEPTH_STATES,
  QUEUE_RESULT_LABEL_NAMES,
  collectQueueDepths,
  recordQueueJobCompleted,
  recordQueueJobFailed,
} from '../queueMetrics';

describe('queue metrics', () => {
  beforeEach(() => {
    metricsRegistry.resetMetrics();
  });

  it('uses only bounded queue labels and states', () => {
    expect(QUEUE_RESULT_LABEL_NAMES).toEqual(['queue']);
    expect(QUEUE_DEPTH_LABEL_NAMES).toEqual(['queue', 'state']);
    expect(QUEUE_DEPTH_STATES).toEqual([
      'waiting',
      'active',
      'delayed',
      'failed',
    ]);
  });

  it('records completed and failed job totals', async () => {
    recordQueueJobCompleted('emailQueue');
    recordQueueJobCompleted('emailQueue');
    recordQueueJobFailed('emailQueue');

    const metrics = await metricsRegistry.metrics();

    expect(metrics).toContain(
      'teamsynch_ai_queue_jobs_completed_total{queue="emailQueue"} 2',
    );
    expect(metrics).toContain(
      'teamsynch_ai_queue_jobs_failed_total{queue="emailQueue"} 1',
    );
  });

  it('collects queue depth for each supported state', async () => {
    const queue = {
      name: 'analyticsQueue',
      getJobCounts: jest.fn().mockResolvedValue({
        waiting: 4,
        active: 2,
        delayed: 3,
        failed: 1,
      }),
    };

    await collectQueueDepths([queue]);

    const metrics = await metricsRegistry.metrics();

    expect(queue.getJobCounts).toHaveBeenCalledWith(
      'waiting',
      'active',
      'delayed',
      'failed',
    );
    expect(metrics).toContain(
      'teamsynch_ai_queue_depth{queue="analyticsQueue",state="waiting"} 4',
    );
    expect(metrics).toContain(
      'teamsynch_ai_queue_depth{queue="analyticsQueue",state="active"} 2',
    );
    expect(metrics).toContain(
      'teamsynch_ai_queue_depth{queue="analyticsQueue",state="delayed"} 3',
    );
    expect(metrics).toContain(
      'teamsynch_ai_queue_depth{queue="analyticsQueue",state="failed"} 1',
    );
  });
});
