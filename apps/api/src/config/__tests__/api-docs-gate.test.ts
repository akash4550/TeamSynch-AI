import { shouldExposeApiDocs } from '../api-docs-gate';

/*
 * FEATURE (ledger #17 — 2026-08-06): pins for the /api/v1/docs exposure
 * policy. Before this gate the swagger UI — an unauthenticated route map
 * of the API surface — was mounted in EVERY environment, production
 * included, as an accident of history rather than a decision. These pins
 * freeze the approved matrix:
 *   - explicit 'true'  wins everywhere (intentional opt-in, incl. prod);
 *   - explicit 'false' loses everywhere (explicit opt-out);
 *   - unset/unrecognized keeps dev+test mounted and withholds prod.
 */
describe('shouldExposeApiDocs (ledger #17)', () => {
  test('production defaults to NOT exposed (secure-by-default)', () => {
    expect(shouldExposeApiDocs('production', undefined)).toBe(false);
    expect(shouldExposeApiDocs('production', '')).toBe(false);
    expect(shouldExposeApiDocs('production', 'garbage')).toBe(false);
  });

  test("explicit 'true' exposes docs even in production (intentional opt-in)", () => {
    expect(shouldExposeApiDocs('production', 'true')).toBe(true);
    expect(shouldExposeApiDocs('production', ' TRUE ')).toBe(true);
    expect(shouldExposeApiDocs('development', 'true')).toBe(true);
  });

  test("explicit 'false' hides docs even in development (opt-out lockdown)", () => {
    expect(shouldExposeApiDocs('development', 'false')).toBe(false);
    expect(shouldExposeApiDocs('test', ' FALSE ')).toBe(false);
    expect(shouldExposeApiDocs('production', 'false')).toBe(false);
  });

  test('development and test keep the zero-config docs workflow when unset', () => {
    expect(shouldExposeApiDocs('development', undefined)).toBe(true);
    expect(shouldExposeApiDocs('test', undefined)).toBe(true);
  });

  test('a missing NODE_ENV behaves like development (non-production → mounted)', () => {
    expect(shouldExposeApiDocs(undefined, undefined)).toBe(true);
  });
});
