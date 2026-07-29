import {
  collectDefaultMetrics,
  Counter,
  Histogram,
  Registry,
} from 'prom-client';

export const HTTP_LABEL_NAMES = [
  'method',
  'route',
  'status',
] as const;

interface HttpRequestMetric {
  method: string;
  route: string;
  status: number;
  durationSeconds: number;
}

export const metricsRegistry = new Registry();

collectDefaultMetrics({
  register: metricsRegistry,
  prefix: 'teamsynch_ai_'
});

export const httpRequestsTotal = new Counter({
  name: 'teamsynch_ai_http_requests_total',
  help: 'Total number of HTTP requests processed',
  labelNames: HTTP_LABEL_NAMES,
  registers: [metricsRegistry],
});

export const httpRequestErrorsTotal = new Counter({
  name: 'teamsynch_ai_http_request_errors_total',
  help: 'Total number of HTTP requests resulting in server errors',
  labelNames: HTTP_LABEL_NAMES,
  registers: [metricsRegistry],
});

export const httpRequestDurationSeconds = new Histogram({
  name: 'teamsynch_ai_http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: HTTP_LABEL_NAMES,
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
    10,
  ],
  registers: [metricsRegistry],
});

export function recordHttpRequest({
  method,
  route,
  status,
  durationSeconds,
}: HttpRequestMetric): void {
  const labels = {
    method: method.toUpperCase(),
    route,
    status: String(status),
  };

  httpRequestsTotal.inc(labels);

  httpRequestDurationSeconds.observe(
    labels,
    durationSeconds,
  );

  if (status >= 500) {
    httpRequestErrorsTotal.inc(labels);
  }
}
