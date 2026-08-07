import { randomUUID } from 'node:crypto';
import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { getNormalizedRoute, getMetricsRoute } from '../utils/requestRoute';
import { recordHttpRequest } from '../metrics/httpMetrics';

export const requestObservability = (req: Request, res: Response, next: NextFunction) => {
  const headerValue = req.get('x-request-id');

  let requestId: string;
  if (typeof headerValue === 'string' && /^[a-zA-Z0-9._:-]{1,128}$/.test(headerValue)) {
    requestId = headerValue;
  } else {
    requestId = randomUUID();
  }

  req.requestId = requestId;
  req.requestStartedAt = performance.now();

  res.setHeader('x-request-id', requestId);

  res.once('finish', () => {
    const durationMs = performance.now() - req.requestStartedAt;

    // #93: two different consumers, two different truths. Prometheus gets a
    // CARDINALITY-BOUNDED label (unmatched 404s collapse to the 'unmatched'
    // constant — see requestRoute.ts); the access log keeps the raw path,
    // where scanner noise is useful forensic signal, not a memory leak.
    const metricsRoute = getMetricsRoute(req);
    const route = getNormalizedRoute(req);
    recordHttpRequest({
    method: req.method,
    route: metricsRoute,
    status: res.statusCode,
    durationSeconds: durationMs / 1000
  });

  // Existing logger call stays here
    logger.info('HTTP request completed', {
      requestId: req.requestId,
      method: req.method,
      route,
      status: res.statusCode,
      durationMs,
      userId: req.user?.id,
      organizationId: req.user?.organizationId,
    });
  });

  next();
};