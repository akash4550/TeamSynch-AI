/*
 * TOOLCHAIN (ledger #13 — 2026-08-05): per-suite handle teardown.
 *
 * Two independent defects made `npm test` unusable:
 *
 * 1. HANDLE STORM — each suite file re-imports the queues module into a
 *    FRESH jest module registry, and every BullMQ Queue construction issues
 *    an INFO against the shared Redis client — spawning connection wrappers
 *    with retry loops (~7 per suite file) that survive their suite and
 *    choke the worker. The test Redis (default redis://127.0.0.1:56379) is
 *    usually absent on dev machines, so those loops retry forever.
 * 2. WORKER KILLER — BullMQ RedisConnection.close() on a SHARED connection
 *    strips its listeners in `finally` but never suppresses the in-flight
 *    init() (suppression only runs for non-shared connections). Disconnect
 *    the shared client afterwards and init() rejects on the next tick,
 *    emitting 'error' into zero listeners — ERR_UNHANDLED_ERROR killed the
 *    worker ('Connection is closed.'). Reproduced standalone and A/B-proven
 *    against the absorber shield below.
 *
 * (A third, unrelated exit-blocker — jest.resetModules() parking the
 * jest-30 vm-module linker under --experimental-vm-modules — is fixed at
 * its call site in ai-provider.factory.test.ts, where it was dead code.)
 *
 * This file is registered via setupFilesAfterEnv, so it runs inside each
 * test file's own module registry and closes the SAME instances that
 * suite's imports created:
 *   1. BullMQ queues via closeAllQueues(), then a	post-close 'error'
 *      absorber on each queue's RedisConnection wrapper (attached AFTER
 *      close so close()'s removeAllListeners can't strip it, BEFORE the
 *      shared client disconnect — test-scoped, affects no assertion).
 *   2. The shared Redis singleton — disconnect(), never quit() (quit
 *      awaits a server reply that can never arrive when Redis is absent).
 *   3. Prisma — $disconnect is a no-op in suites that never queried, and
 *      a clean close where one did. (No setTimeout "safety race": jest
 *      counts pending timers as open handles, so the race itself kept the
 *      worker alive. Disclosed, fixed.)
 */
import { getExistingRedisClient } from '../core/redis/redis.client';
import { prisma } from '../config/prisma';

afterAll(async () => {
  // Best-effort by contract: teardown must never make a passing suite red.
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { allQueues, closeAllQueues } = require('../modules/jobs/queues');
    await closeAllQueues();
    for (const queue of allQueues as Array<{ connection?: unknown }>) {
      try {
        const wrapper = queue?.connection as
          | { on?: (event: string, cb: () => void) => void }
          | undefined;
        if (wrapper && typeof wrapper.on === 'function') {
          wrapper.on('error', () => undefined);
        }
      } catch {
        // intentional: shield is best-effort too
      }
    }
  } catch {
    // intentional: teardown is best-effort
  }

  try {
    const client = getExistingRedisClient();
    if (client) {
      client.removeAllListeners();
      if (client.status !== 'end') {
        client.disconnect();
      }
    }
  } catch {
    // intentional: teardown is best-effort
  }

  try {
    await prisma.$disconnect();
  } catch {
    // intentional: teardown is best-effort
  }
});
