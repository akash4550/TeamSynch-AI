type WorkerEventHandler = (...args: any[]) => void;

interface MockWorker {
  name: string;
  handlers: Record<string, WorkerEventHandler>;
  on: jest.Mock;
  close: jest.Mock;
}

const mockWorkers: MockWorker[] = [];
const mockRecordQueueJobCompleted = jest.fn();
const mockRecordQueueJobFailed = jest.fn();

jest.mock('bullmq', () => ({
  Worker: jest.fn().mockImplementation((name: string) => {
    const handlers: Record<string, WorkerEventHandler> = {};

    const worker: MockWorker = {
      name,
      handlers,
      on: jest.fn(),
      close: jest.fn(),
    };

    worker.on.mockImplementation(
      (event: string, handler: WorkerEventHandler) => {
        handlers[event] = handler;
        return worker;
      },
    );

    mockWorkers.push(worker);
    return worker;
  }),
}));

jest.mock('../../../core/redis/redis.client', () => ({
  getRedisClient: jest.fn(() => ({})),
}));

jest.mock('../../../core/metrics/queueMetrics', () => ({
  recordQueueJobCompleted: mockRecordQueueJobCompleted,
  recordQueueJobFailed: mockRecordQueueJobFailed,
}));

jest.mock('../queues', () => ({
  // TOOLCHAIN REPIN (ledger #13 — 2026-08-05): the mock froze the 4-queue
  // world of its era. Two queues were added since: MAINTENANCE (BUG FIX
  // #48 — stranded-maintenance worker) and DOCUMENTS (ledger #9 — RAG
  // ingestion dispatch). The mock now mirrors the full 6-worker reality so
  // the assertions below pin dispatch coverage, not stale topology.
  QUEUE_NAMES: {
    EMAIL: 'emailQueue',
    NOTIFICATIONS: 'notificationsQueue',
    ANALYTICS: 'analyticsQueue',
    AI: 'aiQueue',
    MAINTENANCE: 'maintenanceQueue',
    DOCUMENTS: 'documentsQueue',
  },
}));

jest.mock('../processors/email.processor', () => ({
  emailProcessor: jest.fn(),
}));

jest.mock('../processors/notification.processor', () => ({
  notificationProcessor: jest.fn(),
}));

jest.mock('../processors/analytics.processor', () => ({
  analyticsProcessor: jest.fn(),
}));

jest.mock('../processors/ai.processor', () => ({
  aiProcessor: jest.fn(),
}));

import { startWorkers } from '../workers';

describe('job workers metrics', () => {
  beforeEach(() => {
    mockWorkers.length = 0;
    mockRecordQueueJobCompleted.mockClear();
    mockRecordQueueJobFailed.mockClear();

    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('records completed and failed jobs using the worker queue name', () => {
    startWorkers();

    // TOOLCHAIN REPIN (ledger #13 — 2026-08-05): 4 → 6 workers (maintenance
    // #48, documents — ledger #9). Also pins that every started worker has
    // a real queue name — a missing QUEUE_NAMES entry must never slip back
    // to `undefined` (that is how this stale mock failed to notice the drift).
    expect(mockWorkers).toHaveLength(6);
    expect(mockWorkers.map(worker => worker.name).sort()).toEqual([
      'aiQueue',
      'analyticsQueue',
      'documentsQueue',
      'emailQueue',
      'maintenanceQueue',
      'notificationsQueue',
    ]);

    const emailWorker = mockWorkers.find(
      worker => worker.name === 'emailQueue',
    );

    expect(emailWorker).toBeDefined();

    emailWorker!.handlers.completed({
      id: 'job-1',
      name: 'send-email',
    });

    emailWorker!.handlers.failed(
      {
        id: 'job-2',
        name: 'send-email',
      },
      new Error('delivery failed'),
    );

    expect(mockRecordQueueJobCompleted).toHaveBeenCalledWith(
      'emailQueue',
    );

    expect(mockRecordQueueJobFailed).toHaveBeenCalledWith(
      'emailQueue',
    );
  });
});
