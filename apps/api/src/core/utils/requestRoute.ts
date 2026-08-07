import { Request } from 'express';

/**
 * Human-facing normalization of the request path. When the request matched
 * a route, the route template (with :params) is reconstructed with its
 * mount prefix; otherwise the raw pathname is returned. Used for LOG lines,
 * where the raw path is valuable forensics.
 */
export function getNormalizedRoute(req: Request): string {
  const pathname = req.originalUrl.split('?')[0];

  if (!req.route || typeof req.route.path !== 'string') {
    return pathname;
  }

  if (req.route.path === '/') {
    return pathname;
  }

  const routeSegments = req.route.path.split('/').filter(Boolean);
  const pathSegments = pathname.split('/').filter(Boolean);

  const prefixLength = Math.max(0, pathSegments.length - routeSegments.length);
  const prefixSegments = pathSegments.slice(0, prefixLength);

  const prefix = prefixSegments.length > 0 ? '/' + prefixSegments.join('/') : '';
  const routePath = req.route.path.startsWith('/') ? req.route.path : `/${req.route.path}`;

  return `${prefix}${routePath}`;
}

/*
 * BUG FIX (#93 — unbounded Prometheus label cardinality from 404s):
 * getNormalizedRoute returns the RAW PATHNAME for unmatched requests, and
 * requestObservability fed it straight into the `route` label of
 * httpRequestsTotal / httpRequestErrorsTotal / httpRequestDurationSeconds.
 * Every unauthenticated hit on a nonexistent path — internet scanners
 * probing /.git/config, /wp-admin, UUID-suffixed guesses, path-traversal
 * strings — minted a PERMANENT unique label value on all three metrics
 * (the histogram alone is 13 series: 11 buckets + sum + count). On a
 * public deployment the metrics registry grows monotonically with attacker
 * input until memory and the /metrics scrape payload are dominated by
 * garbage series — the classic cardinality-explosion incident, fed by the
 * global middleware on the request path itself.
 *
 * getMetricsRoute bounds the label: any request express could NOT match to
 * a string route template collapses to a single constant. Method and
 * status already live in their own labels, so `unmatched` bucketed by
 * method/status stays analytically useful, and the raw path remains in the
 * structured access log (where cardinality is harmless).
 */
export const UNMATCHED_ROUTE_LABEL = 'unmatched';

export function getMetricsRoute(req: Request): string {
  if (!req.route || typeof req.route.path !== 'string') {
    return UNMATCHED_ROUTE_LABEL;
  }
  return getNormalizedRoute(req);
}
