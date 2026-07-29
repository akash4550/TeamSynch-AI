import { Registry } from 'prom-client';

import {
  HTTP_LABEL_NAMES,
  metricsRegistry,
  recordHttpRequest,
} from '../httpMetrics';

describe('HTTP metrics', () => {
  beforeEach(() => {
    metricsRegistry.resetMetrics();
  });

  it('uses a dedicated Prometheus registry', () => {
    expect(metricsRegistry).toBeInstanceOf(Registry);
  });

  it('uses only bounded HTTP labels', () => {
    expect(HTTP_LABEL_NAMES).toEqual([
      'method',
      'route',
      'status',
    ]);
  });

  it('records a successful request and its duration', async () => {
    recordHttpRequest({
      method: 'GET',
      route: '/api/v1/system/live',
      status: 200,
      durationSeconds: 0.125,
    });

    const metrics = await metricsRegistry.metrics();

    expect(metrics).toContain(
      'teamsynch_ai_http_requests_total{method="GET",route="/api/v1/system/live",status="200"} 1',
    );

    expect(metrics).toContain(
      'teamsynch_ai_http_request_duration_seconds_count{method="GET",route="/api/v1/system/live",status="200"} 1',
    );

    expect(metrics).toContain(
      'teamsynch_ai_http_request_duration_seconds_sum{method="GET",route="/api/v1/system/live",status="200"} 0.125',
    );

    expect(metrics).not.toContain(
      'teamsynch_ai_http_request_errors_total{method="GET",route="/api/v1/system/live",status="200"}',
    );
  });

  it('records a failed request in request and error counters', async () => {
    recordHttpRequest({
      method: 'POST',
      route: '/api/v1/tasks',
      status: 500,
      durationSeconds: 0.5,
    });

    const metrics = await metricsRegistry.metrics();

    expect(metrics).toContain(
      'teamsynch_ai_http_requests_total{method="POST",route="/api/v1/tasks",status="500"} 1',
    );

    expect(metrics).toContain(
      'teamsynch_ai_http_request_errors_total{method="POST",route="/api/v1/tasks",status="500"} 1',
    );

    expect(metrics).toContain(
      'teamsynch_ai_http_request_duration_seconds_count{method="POST",route="/api/v1/tasks",status="500"} 1',
    );
  });

  it('accumulates repeated requests with the same bounded labels', async () => {
    recordHttpRequest({
      method: 'GET',
      route: '/api/v1/users/:id',
      status: 200,
      durationSeconds: 0.1,
    });

    recordHttpRequest({
      method: 'GET',
      route: '/api/v1/users/:id',
      status: 200,
      durationSeconds: 0.2,
    });

    const metrics = await metricsRegistry.metrics();

    expect(metrics).toContain(
      'teamsynch_ai_http_requests_total{method="GET",route="/api/v1/users/:id",status="200"} 2',
    );

    expect(metrics).toContain(
      'teamsynch_ai_http_request_duration_seconds_count{method="GET",route="/api/v1/users/:id",status="200"} 2',
    );

    expect(metrics).toContain(
      'teamsynch_ai_http_request_duration_seconds_sum{method="GET",route="/api/v1/users/:id",status="200"} 0.30000000000000004',
    );
  });
});
