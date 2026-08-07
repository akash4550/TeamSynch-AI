import Redis from 'ioredis';
import { env } from '../../config/env';

let redisClient: Redis | null = null;

export const getRedisClient = (): Redis => {
  if (!redisClient) {
    redisClient = new Redis(
      env.REDIS_URL ?? 'redis://localhost:6379',
      {
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
        lazyConnect: true,
      }
    );

    redisClient.on('connect', () => {
      console.log('Connected to Redis');
    });

    redisClient.on('ready', () => {
      console.log('Redis is ready');
    });

    redisClient.on('error', (err) => {
      console.error('Redis connection error:', err.message);
    });
  }

  return redisClient;
};

/** TEST SUPPORT (ledger #13 — 2026-08-05): non-constructing probe so the
 * jest teardown can close an existing client WITHOUT instantiating one for
 * suites that never touched Redis (calling getRedisClient() there would
 * create a handle purely to then close it). */
export const getExistingRedisClient = (): Redis | null => redisClient;

export const closeRedisClient = async (): Promise<void> => {
  if (!redisClient) {
    return;
  }

  const client = redisClient;
  redisClient = null;

  client.removeAllListeners();

  if (client.status !== 'end') {
    await client.quit();
  }
};

export const redisConnection =
  env.REDIS_URL ?? 'redis://localhost:6379';
