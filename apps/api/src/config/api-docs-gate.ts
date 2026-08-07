/*
 * FEATURE (ledger #17 — 2026-08-06, approved pick): /api/v1/docs exposure
 * is now a decision, not a default. The swagger UI is a self-serve route
 * map of the API surface; until now it was mounted unauthenticated in
 * EVERY environment, production included — attack-surface nobody chose.
 *
 * Policy (single source of truth, jest-pinned):
 *   - explicitly 'true'   → mounted in EVERY environment (intentional opt-in,
 *                           including production deployments that want public docs);
 *   - explicitly 'false'  → never mounted (explicit opt-out, e.g. staging lockdown);
 *   - unset / unrecognized → mounted OUTSIDE production (dev + test keep the
 *                           zero-config workflow), NOT mounted in production
 *                           (secure-by-default: the route falls through to the
 *                           standard unmatched-route 404 envelope).
 *
 * Pure and side-effect-free so the whole truth matrix is jest-pinnable;
 * the only runtime caller is app.ts.
 */
export type ApiDocsEnv = 'development' | 'test' | 'production' | string | undefined;

export const shouldExposeApiDocs = (
  nodeEnv: ApiDocsEnv,
  enableFlag: string | undefined,
): boolean => {
  const flag = (enableFlag ?? '').trim().toLowerCase();
  if (flag === 'true') return true;
  if (flag === 'false') return false;
  return (nodeEnv ?? 'development') !== 'production';
};
