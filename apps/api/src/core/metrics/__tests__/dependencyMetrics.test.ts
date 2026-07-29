import { metricsRegistry } from '../httpMetrics';
import {
  DEPENDENCY_DURATION_LABEL_NAMES,
  DEPENDENCY_LABEL_NAMES,
  DEPENDENCY_RESULTS,
  observeDependencyCheck,
} from '../dependencyMetrics';

describe('dependency metrics', () => {
  beforeEach(() => {
    metricsRegistry.resetMetrics();
  });

  it('uses only bounded dependency labels and results', () => {
    expect(DEPENDENCY_LABEL_NAMES).toEqual([
      'dependency',
    ]);

    expect(DEPENDENCY_DURATION_LABEL_NAMES).toEqual([
      'dependency',
      'result',
    ]);

    expect(DEPENDENCY_RESULTS).toEqual([
      'success',
      'failure',
    ]);
  });

  it('records a successful dependency check', async () => {
    const result = await observeDependencyCheck(
      'postgres',
      async () => 'connected',
    );

    expect(result).toBe('connected');

    const metrics = await metricsRegistry.metrics();

    expect(metrics).toContain(
      'teamsynch_ai_dependency_up{dependency="postgres"} 1',
    );

    expect(metrics).toContain(
      'teamsynch_ai_dependency_check_duration_seconds_count{dependency="postgres",result="success"} 1',
    );
  });

  it('records a failed check and rethrows the error', async () => {
    await expect(
      observeDependencyCheck(
        'redis',
        async () => {
          throw new Error('Redis unavailable');
        },
      ),
    ).rejects.toThrow('Redis unavailable');

    const metrics = await metricsRegistry.metrics();

    expect(metrics).toContain(
      'teamsynch_ai_dependency_up{dependency="redis"} 0',
    );

    expect(metrics).toContain(
      'teamsynch_ai_dependency_check_duration_seconds_count{dependency="redis",result="failure"} 1',
    );
  });
});
