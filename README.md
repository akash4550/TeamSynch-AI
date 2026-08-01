# TeamSynch AI

A production-oriented, multi-tenant SaaS workspace for projects, tasks, teams, CRM operations, documents, analytics, billing, and organization administration.

TeamSynch AI demonstrates full-stack engineering with tenant isolation, role-based authorization, secure authentication, background queues, real-time infrastructure, automated testing, and cloud deployment.

## Live Application

| Service | Address |
| --- | --- |
| Web application | https://teamsynch-ai.netlify.app |
| API service | https://teamsynch-ai.onrender.com |
| Liveness check | https://teamsynch-ai.onrender.com/api/v1/system/live |
| Readiness check | https://teamsynch-ai.onrender.com/api/v1/system/ready |
| Source code | https://github.com/akash4550/TeamSynch-AI |
| Latest release | https://github.com/akash4550/TeamSynch-AI/releases/tag/v1.0.0 |

The hosted application is a portfolio demonstration environment. Demo access is available from the repository owner on request.

## Highlights

- Multi-tenant data isolation using organization-scoped database operations
- JWT access and refresh-token authentication
- Secure HTTP-only refresh cookies
- Role-based access control and granular permission middleware
- Project and task management
- Team membership and invitation management
- CRM clients, contacts, leads, opportunities, and pipelines
- Document and calendar modules
- Analytics and organization administration
- Stripe webhook verification and billing entitlement checks
- Redis and BullMQ background processing
- Socket.IO real-time infrastructure
- Structured logging and request correlation IDs
- Prometheus-compatible application metrics
- Docker-based production deployment
- Automated CI, CodeQL, unit tests, and integration tests

## Multi-Tenant Security

Every business resource is associated with an `organizationId`.

The API restricts database operations to the authenticated user's organization. Cross-tenant resource access is rejected even when a valid resource identifier from another organization is supplied.

Security-sensitive behavior is enforced by the backend rather than relying only on hidden frontend controls.

The team invitation endpoint includes integration tests that verify:

- Administrators with `TEAM.MANAGE` can retrieve invitations
- Managers without the permission receive `403 Forbidden`
- Cross-organization access returns `404 Not Found`
- Sensitive password data is not returned

## Roles and Access

| Capability | Super Admin | Admin | Manager | Employee |
| --- | :---: | :---: | :---: | :---: |
| Dashboard | Yes | Yes | Yes | Yes |
| Projects and tasks | Yes | Yes | Yes | Yes |
| Create projects | Yes | Yes | No | No |
| Teams | Yes | Yes | Yes | Yes |
| Manage teams | Yes | Yes | No | No |
| CRM workspace | Yes | Yes | Yes | Yes |
| Calendar and documents | Yes | Yes | Yes | Yes |
| Analytics | Yes | Yes | Yes | No |
| User management | Yes | Yes | No | No |
| Organization settings | Yes | Yes | No | No |
| Subscription settings | Yes | Yes | No | No |
| Audit trail | Yes | No | No | No |
| Background jobs | Yes | No | No | No |

## Technology Stack

### Frontend

- React 19
- TypeScript
- Vite
- Tailwind CSS
- TanStack Query
- Zustand
- React Router
- Socket.IO Client
- Vitest
- React Testing Library

### Backend

- Node.js
- Express
- TypeScript
- Prisma ORM
- PostgreSQL
- Redis
- BullMQ
- Socket.IO
- Zod
- Winston
- Jest

### DevOps and Security

- GitHub Actions
- CodeQL
- Docker
- Docker Compose
- Nginx
- Netlify
- Render
- Prometheus-compatible metrics
- Prisma migrations
- Dependency health checks

## Architecture

The project uses a modular-monolith backend architecture.

Typical backend modules separate:

- Routes
- Request validation
- Controllers
- Services
- Repositories
- Unit and integration tests

Application flow:

1. The React application sends HTTPS requests to the Express API.
2. Authentication is handled using access tokens and secure refresh cookies.
3. Permission middleware verifies access before controller execution.
4. Services implement business rules.
5. Repositories execute tenant-scoped Prisma queries.
6. PostgreSQL stores business data.
7. Redis supports queues and real-time infrastructure.
8. BullMQ workers process asynchronous jobs.

## Repository Structure

- `apps/api` - Express API, Prisma schema, services, workers, and tests
- `apps/web` - React and Vite frontend
- `.github/workflows` - CI and security workflows
- `scripts` - maintenance, backup, and operational scripts
- `docker-compose.yml` - local infrastructure
- `docker-compose.production.yml` - production topology
- `PRODUCTION.md` - deployment and recovery runbook
- `SECURITY.md` - vulnerability disclosure policy

## Local Development

### Prerequisites

- Node.js 22 or newer
- npm
- Git
- Docker Engine
- Docker Compose v2

### Setup

1. Clone the repository:

   `git clone https://github.com/akash4550/TeamSynch-AI.git`

2. Enter the project:

   `cd TeamSynch-AI`

3. Install dependencies:

   `npm install`

4. Copy the environment example:

   `cp .env.example .env`

5. Start PostgreSQL and Redis:

   `docker compose up -d postgres redis`

6. Generate the Prisma client:

   `npm run generate --workspace apps/api`

7. Apply the local database schema:

   `npm run db:push --workspace apps/api`

8. Seed demonstration data:

   `npm run seed --workspace apps/api`

9. Start the development servers:

   `npm run dev`

Default development addresses:

- Web application: `http://localhost:5173`
- API service: `http://localhost:4000`

The seed command resets demonstration data. Never run it against a production database.

## Testing

Frontend typecheck:

`npm run typecheck --workspace apps/web`

Backend typecheck:

`npm run typecheck --workspace apps/api`

Frontend tests:

`npm test --workspace apps/web`

Backend tests:

`npm test --workspace apps/api -- --runInBand`

Complete production build:

`npm run build`

## Current Verified Baseline

The current main branch has passed:

- Frontend TypeScript validation
- Backend TypeScript validation
- 18 frontend tests
- 383 backend tests across 39 test suites
- 3 team invitation security integration tests
- Full production build
- GitHub Actions CI
- CodeQL analysis
- Netlify deployment checks
- Production API liveness and readiness checks
- Production CORS preflight verification
- Netlify SPA route verification

## Recent Improvements

- Corrected frontend API response handling
- Added secure team invitation listing
- Added tenant-isolation integration tests
- Aligned navigation with backend permissions
- Restricted administrative routes by role
- Restricted project and team creation controls
- Corrected organization API endpoints
- Corrected error-page redirects
- Removed a duplicate Axios client
- Normalized empty CRM search parameters
- Corrected user and pagination response handling
- Corrected task, project, and team response handling

## Production Deployment

Production deployments must use committed Prisma migrations:

`npx prisma migrate deploy`

Do not use `prisma db push` as a production migration strategy.

The production topology supports:

- PostgreSQL
- Redis
- Migration service
- API service
- React web service
- Nginx
- Container health checks
- Restart policies
- Backup and recovery workflows

See `PRODUCTION.md` for deployment, monitoring, backup, restoration, and rollback instructions.

## Current Limitations

This repository is a portfolio-quality SaaS implementation and demonstration environment rather than a commercially operated service.

Current limitations include:

- AI, email, OAuth, Stripe, and object-storage features require valid provider configuration.
- Some team-detail controls still require complete frontend mutation workflows.
- Background workers currently execute within the API process.
- Production should use one API replica until workers are separated or leader election is implemented.
- Demonstration data may be reset.
- Public demo credentials are intentionally excluded from this README.

## Security

Never commit:

- Environment files
- Database passwords
- JWT secrets
- Stripe secrets
- OAuth secrets
- Storage credentials
- Production tokens

Do not report vulnerabilities through public GitHub issues. Follow the process in `SECURITY.md`.

## Documentation

- Production runbook: `PRODUCTION.md`
- Product vision: `PRODUCT_VISION.md`
- Architecture decision record: `ADR-001-Modular-Monolith.md`
- Security policy: `SECURITY.md`

## License

Licensed under the ISC License. See `LICENSE`.

## Author

Akshay Lakwal

GitHub: https://github.com/akash4550
