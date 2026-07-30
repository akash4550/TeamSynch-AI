# Contributing to TeamSynch AI

Thank you for contributing. Changes must preserve tenant isolation, security controls, test reliability, and production readiness.

## Development Setup

### Prerequisites

- Node.js 22 or later
- npm
- Docker Engine and Docker Compose v2
- Git

### Install and Run

```bash
git clone https://github.com/akash4550/TeamSynch-AI.git
cd TeamSynch-AI
npm install
docker compose up -d postgres redis
npm run generate
npm run db:push --workspace=api
npm run seed --workspace=api
npm run dev
```

## Contribution Workflow

1. Create a focused branch from the latest `main`.
2. Make small, reviewable changes.
3. Add or update tests for behavior changes.
4. Run the required validation locally.
5. Push the branch and open a pull request into `main`.

Direct pushes to `main` are not permitted. Required GitHub Actions checks must pass before merging.

## Required Validation

```bash
npm run typecheck
npm run build
npm run test --workspace=api
npm run test --workspace=web
```

For infrastructure, integration, container, or deployment changes, also run the relevant checks:

```bash
npm run test:integration
npm run docker:build
npm run smoke:production
```

## Security Requirements

- Scope database reads and writes by `organizationId`.
- Keep WebSocket rooms and events tenant isolated.
- Deny unauthenticated and unauthorized access by default.
- Never commit or log secrets, tokens, passwords, or sensitive metadata.
- Validate user-controlled input.
- Preserve Stripe webhook signature verification.
- Keep production containers rootless.

Do not report vulnerabilities through public issues. Follow [SECURITY.md](SECURITY.md).

## Pull Request Expectations

Include a clear summary, motivation, validation performed, UI screenshots when applicable, migration or environment-variable notes, and known limitations.

## Commit Messages

Use concise messages. Conventional prefixes are encouraged: `feat:`, `fix:`, `test:`, `docs:`, and `chore:`.

## Database Changes

Include required Prisma migrations, preserve tenant keys and relationships, review indexes and constraints, and verify migrations against a clean database.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
