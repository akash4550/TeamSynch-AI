import {
  Gauge,
  Histogram,
} from 'prom-client';

import { metricsRegistry } from './httpMetrics';

export const DEPENDENCY_LABEL_NAMES = [
  'dependency',
] as const;

export const DEPENDENCY_DURATION_LABEL_NAMES = [
  'dependency',
  'result',
] as const;

export const DEPENDENCY_RESULTS = [
  'success',
  'failure',
] as const;

type DependencyResult = typeof DEPENDENCY_RESULTS[number];

export const dependencyUp = new Gauge({
  name: 'teamsynch_ai_dependency_up',
  help: 'Whether an application dependency is currently reachable',
  labelNames: DEPENDENCY_LABEL_NAMES,
  registers: [metricsRegistry],
});

export const dependencyCheckDurationSeconds = new Histogram({
  name: 'teamsynch_ai_dependency_check_duration_seconds',
  help: 'Duration of application dependency health checks in seconds',
  labelNames: DEPENDENCY_DURATION_LABEL_NAMES,
  buckets: [
    0.005,
    0.01,
    0.025,
    0.05,
    0.1,
    0.25,
    0.5,
    1,
    2.5,
    5,
  ],
  registers: [metricsRegistry],
});

export async function observeDependencyCheck<T>(
  dependency: string,
  check: () => Promise<T>,
): Promise<T> {
  const startedAt = process.hrtime.bigint();
  let result: DependencyResult = 'success';

  try {
    const value = await check();

    dependencyUp.set(
      { dependency },
      1,
    );

    return value;
  } catch (error) {
    result = 'failure';

    dependencyUp.set(
      { dependency },
      0,
    );

    throw error;
  } finally {
    const durationSeconds =
      Number(process.hrtime.bigint() - startedAt) / 1_000_000_000;

    dependencyCheckDurationSeconds.observe(
      {
        dependency,
        result,
      },
      durationSeconds,
    );
  }
}
