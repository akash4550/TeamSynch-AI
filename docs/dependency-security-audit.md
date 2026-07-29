# Dependency Security Audit

## Audit date

July 26, 2026

## Scope

This review addresses npm audit findings for the TeamSynch AI production dependency tree.

## Remediated findings

- `brace-expansion` was updated from `5.0.7` to `5.0.8`.
- `fast-uri` was updated from `3.1.3` to `3.1.4`.
- `ts-jest` was updated from `29.4.11` to `29.4.12`.

No forced or unrelated dependency upgrades were applied.

## React Router risk decision

`npm audit --omit=dev` reports `GHSA-qwww-vcr4-c8h2` against `react-router@7.18.1`.

The advisory affects React Server Components mode. TeamSynch AI currently uses standard client-side routing through `BrowserRouter`, `Routes`, `Route`, `Navigate`, `Outlet`, `Link`, and navigation hooks. The web application source does not use React Server Components, RSC action APIs, or server-router APIs.

The npm-proposed remediation would force `react-router-dom@7.11.0`, introducing a breaking downgrade. Because the affected execution mode is not used by TeamSynch AI, the current version is retained as an accepted, non-reachable risk until an upstream patched release is available.

## Validation

The remediation was validated with:

- API tests: 30 suites and 347 tests passed.
- API typecheck passed.
- API production build passed.
- Web tests: 4 files and 18 tests passed.
- Web typecheck passed.
- Web production build passed.
- Production audit reduced to the React Router RSC-only advisory.

## Review triggers

Reassess this decision when:

- TeamSynch AI introduces React Server Components or server actions.
- React Router publishes a patched compatible release.
- The advisory scope or exploitability changes.
