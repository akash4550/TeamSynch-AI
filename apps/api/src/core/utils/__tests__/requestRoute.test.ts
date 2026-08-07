/*
 * BUG FIX (#93 — 2026-08-05) pins: unmatched requests must NEVER mint a
 * unique Prometheus label value. The metrics route for a 404 collapses to
 * the UNMATCHED_ROUTE_LABEL constant (bounded by method + status, which
 * live in their own labels), while the human access log keeps the raw
 * pathname for forensics. Matched-route normalization (template + mount
 * prefix) is pinned too, so the two behaviors can't silently swap.
 */
import { getMetricsRoute, getNormalizedRoute, UNMATCHED_ROUTE_LABEL } from '../requestRoute';

const fakeReq = (originalUrl: string, route?: { path: unknown }): any => ({
  originalUrl,
  route,
});

describe('getNormalizedRoute (log route)', () => {
  it('reconstructs mount prefix + route template for matched routes', () => {
    const req = fakeReq('/api/v1/tasks/abc-123?expand=comments', { path: '/:id' });
    expect(getNormalizedRoute(req)).toBe('/api/v1/tasks/:id');
  });

  it('strips the query string', () => {
    const req = fakeReq('/api/v1/system/live?t=1', { path: '/live' });
    expect(getNormalizedRoute(req)).toBe('/api/v1/system/live');
  });

  it('returns the raw pathname when no route matched (404)', () => {
    const req = fakeReq('/.git/config', undefined);
    expect(getNormalizedRoute(req)).toBe('/.git/config');
  });

  it('returns static pathname for root handlers under static mounts (bounded)', () => {
    const req = fakeReq('/api/v1/documents', { path: '/' });
    expect(getNormalizedRoute(req)).toBe('/api/v1/documents');
  });
});

describe('getMetricsRoute (Prometheus label)', () => {
  it('uses the same template+prefix normalization for matched routes', () => {
    const req = fakeReq('/api/v1/tasks/abc-123', { path: '/:id' });
    expect(getMetricsRoute(req)).toBe('/api/v1/tasks/:id');
  });

  it('collapses unmatched 404s to the bounded constant', () => {
    const req = fakeReq('/.git/config', undefined);
    expect(getMetricsRoute(req)).toBe(UNMATCHED_ROUTE_LABEL);
  });

  it('collapses non-string route templates (regex/array routes) too', () => {
    const req = fakeReq('/anything/12345', { path: /\/anything\/\d+/ });
    expect(getMetricsRoute(req)).toBe(UNMATCHED_ROUTE_LABEL);
  });

  it('keeps cardinality bounded across DISTINCT attacker paths', () => {
    // The exact incident class being fixed: an arbitrary number of unique
    // probe paths must produce at most ONE metrics label value.
    const probes = [
      '/.git/config',
      '/wp-login.php',
      '/api/v1/users/00000000-0000-4000-8000-000000000001',
      '/api/v1/users/00000000-0000-4000-8000-000000000002',
      '/../../../etc/passwd',
      '/api/v1/tasks/../../../../etc/shadow',
    ];
    const labels = new Set(probes.map((p) => getMetricsRoute(fakeReq(p, undefined))));
    expect(labels.size).toBe(1);
    expect([...labels][0]).toBe(UNMATCHED_ROUTE_LABEL);
  });
});
