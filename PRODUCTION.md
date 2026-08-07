# TeamSynch AI Production Runbook

This runbook covers the RC1 single-node Docker Compose deployment defined by `docker-compose.production.yml`.

## 1. Production Architecture

The production topology contains:

- **PostgreSQL 15** for persistent application data.
- **Redis 7** for queues, caching, and realtime infrastructure.
- **Migration service** that runs `prisma migrate deploy` before API startup.
- **API service** containing the HTTP API, Socket.IO server, scheduled jobs, and BullMQ workers.
- **Web service** running the compiled React application behind Nginx.

The API does not start unless:

1. PostgreSQL is healthy.
2. All committed Prisma migrations complete successfully.
3. Redis is healthy.

The web service does not start until the API readiness check passes.

> RC1 runs background workers and scheduled jobs inside the API process. Run only one API replica until worker leadership or a separate worker service is implemented.

## 2. Host Prerequisites

The deployment host requires:

- Docker Engine
- Docker Compose v2
- Git
- Adequate persistent storage for Docker volumes
- A DNS name and TLS termination for internet-facing deployments
- An external backup destination

Only ports required by the deployment should be publicly reachable.

- Expose the public web endpoint through ports 80 and 443.
- Restrict direct access to the API port with the host firewall.
- Do not expose PostgreSQL or Redis publicly.

The included Nginx container serves HTTP. Use a load balancer, ingress controller, or host reverse proxy for TLS termination.

## 3. Environment Configuration

Create the production environment file:

```bash
cp .env.production.example .env.production
chmod 600 .env.production
```

Replace every placeholder before deployment.

Required secrets:

- `DB_PASSWORD`
- `REDIS_PASSWORD`
- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- `ENCRYPTION_SECRET_KEY`

Both JWT secrets must:

- contain at least 32 characters
- be different from each other
- be generated from a cryptographically secure source

`ENCRYPTION_SECRET_KEY` (added 2026-08-06, BUG FIX #106) must:

- contain at least 32 characters
- be different from every JWT secret
- be generated from a cryptographically secure source
- never be rotated casually once calendar tokens exist — rows sealed
  with the old key will fail AES-256-GCM verification (users reconnect
  their calendar to re-seal). After first enabling it, previously stored
  tokens (sealed with the former development fallback) are unrecoverable
  by design; affected users simply reconnect.

Database and Redis passwords are interpolated into connection URLs. Use URL-safe characters unless the Compose configuration is changed to encode credentials.

For non-loopback deployments, `FRONTEND_URL` must:

- use HTTPS
- contain only the public origin
- contain no path, credentials, query string, or fragment

Valid example:

```text
https://app.example.com
```

Invalid examples:

```text
http://app.example.com
https://user:password@app.example.com
https://app.example.com/dashboard
```

Never commit `.env.production`.

## 4. Validate Configuration

Validate environment interpolation and Compose syntax before building:

```bash
docker compose \
  --env-file .env.production \
  -f docker-compose.production.yml \
  config --quiet
```

A successful command produces no output and exits with status `0`.

Review the rendered service configuration when diagnosing interpolation issues:

```bash
docker compose \
  --env-file .env.production \
  -f docker-compose.production.yml \
  config
```

Do not publish the rendered output because it contains secrets.

## 5. Build Production Images

Build the API and web images:

```bash
docker compose \
  --env-file .env.production \
  -f docker-compose.production.yml \
  build api web
```

The resulting local images are:

- `teamsynch-ai-api`
- `teamsynch-ai-web`

The migration service uses the same image as the API.

## 6. Initial Deployment

Start the complete topology:

```bash
docker compose \
  --env-file .env.production \
  -f docker-compose.production.yml \
  up -d --no-build --wait postgres redis api web
```

Compose automatically starts the migration dependency before the API.

Inspect service state:

```bash
docker compose \
  --env-file .env.production \
  -f docker-compose.production.yml \
  ps -a
```

A successful deployment shows:

- PostgreSQL: `healthy`
- Redis: `healthy`
- Migration service: `Exited (0)`
- API: `healthy`
- Web: `healthy`

Verify the migration output:

```bash
docker compose \
  --env-file .env.production \
  -f docker-compose.production.yml \
  logs migrate
```

The migration logs must show that all migrations were applied or that no pending migrations exist.

### 6.1 Create the first administrator

The production seed command is destructive and refuses to run in production. Use the guarded
bootstrap utility once after migrations complete. Run it from a trusted administrator workstation
with the repository dependencies installed.

Set these values only in the current shell:

- `DATABASE_URL`: the production PostgreSQL connection URL
- `BOOTSTRAP_ADMIN_EMAIL`: the first administrator's email address
- `BOOTSTRAP_ADMIN_PASSWORD`: a unique password of at least 14 characters, with no leading or trailing whitespace
- `BOOTSTRAP_CONFIRM=CREATE_FIRST_ADMIN`

Optional identity values are `BOOTSTRAP_ADMIN_FIRST_NAME`, `BOOTSTRAP_ADMIN_LAST_NAME`,
`BOOTSTRAP_ORGANIZATION_NAME`, and `BOOTSTRAP_ORGANIZATION_SLUG`.

Run:

```bash
npm run admin:bootstrap-production
```

The utility creates one organization and one `SUPER_ADMIN` in a transaction. It refuses to run
when any organization or user already exists. Record the printed workspace ID, then immediately
clear the database URL and password from the shell and clipboard.

To reset that administrator later, set `DATABASE_URL`, `BOOTSTRAP_ORGANIZATION_ID`,
`BOOTSTRAP_ADMIN_EMAIL`, a new `BOOTSTRAP_ADMIN_PASSWORD`, and
`BOOTSTRAP_CONFIRM=RESET_PRODUCTION_ADMIN_PASSWORD`, then run:

```bash
npm run admin:reset-production-password
```

The reset utility targets only an active `SUPER_ADMIN`, clears login lockout state, and revokes all
existing refresh sessions. Neither utility prints the password or database URL. Never store these
values in a tracked environment file or pass the password as a command-line argument.

## 7. Post-Deployment Verification

Load the environment values into the current shell:

```bash
set -a
. ./.env.production
set +a
```

Verify the web application:

```bash
curl --fail --silent --show-error \
  "http://127.0.0.1:${WEB_PORT:-80}/"
```

Verify API liveness through Nginx:

```bash
curl --fail --silent --show-error \
  "http://127.0.0.1:${WEB_PORT:-80}/api/v1/system/live"
```

Verify dependency readiness through Nginx:

```bash
curl --fail --silent --show-error \
  "http://127.0.0.1:${WEB_PORT:-80}/api/v1/system/ready"
```

A successful readiness response reports:

- `status` as `ready`
- `database` as `connected`
- `redis` as `connected`

External monitoring and load balancers should use:

```text
GET /api/v1/system/ready
```

Container restart policies should use the Docker health checks already defined in Compose.

## 8. Deploying an Update

Create and verify a database backup before deploying changes that include migrations.

Pull the approved revision:

```bash
git fetch origin
git switch main
git pull --ff-only origin main
```

Validate the production environment:

```bash
docker compose \
  --env-file .env.production \
  -f docker-compose.production.yml \
  config --quiet
```

Build updated images:

```bash
docker compose \
  --env-file .env.production \
  -f docker-compose.production.yml \
  build api web
```

Ensure PostgreSQL and Redis are running:

```bash
docker compose \
  --env-file .env.production \
  -f docker-compose.production.yml \
  up -d --no-build --wait postgres redis
```

Remove the previous completed migration container:

```bash
docker compose \
  --env-file .env.production \
  -f docker-compose.production.yml \
  rm -f migrate
```

Run the new migrations as a blocking release gate:

```bash
docker compose \
  --env-file .env.production \
  -f docker-compose.production.yml \
  up --no-build migrate
```

Do not continue when the migration command exits unsuccessfully.

Start the updated API and web services:

```bash
docker compose \
  --env-file .env.production \
  -f docker-compose.production.yml \
  up -d --no-build --wait api web
```

Repeat the post-deployment verification checks.

## 9. Logs and Diagnostics

Display service status:

```bash
docker compose \
  --env-file .env.production \
  -f docker-compose.production.yml \
  ps -a
```

Follow API and web logs:

```bash
docker compose \
  --env-file .env.production \
  -f docker-compose.production.yml \
  logs --follow api web
```

Inspect migration failures:

```bash
docker compose \
  --env-file .env.production \
  -f docker-compose.production.yml \
  logs migrate postgres
```

Inspect Redis failures:

```bash
docker compose \
  --env-file .env.production \
  -f docker-compose.production.yml \
  logs redis api
```

Application logs are written to standard output. Production infrastructure should collect container logs into a durable centralized logging system.

### 9.1 Protected Metrics Endpoint

Prometheus-format application metrics are available at:

~~~text
GET /api/v1/system/metrics
~~~

The endpoint requires a valid `SUPER_ADMIN` access token. It must not be
published as an anonymous public endpoint.

Example verification:

~~~bash
curl --fail --silent --show-error \
  --header "Authorization: Bearer ${SUPER_ADMIN_ACCESS_TOKEN}" \
  "http://127.0.0.1:${WEB_PORT:-80}/api/v1/system/metrics"
~~~

A production metrics collector should use a dedicated protected credential and
store it in the platform secret manager. Do not place access tokens in source
control, shell history, dashboards, or alert descriptions.

The metrics baseline includes:

- HTTP request count, server-error count, and request-duration histograms
- BullMQ waiting, active, delayed, and failed queue depths
- BullMQ completed-job and failed-job counters
- PostgreSQL and Redis availability and check-duration histograms
- Node.js process and runtime metrics

### 9.2 Initial Alert Thresholds

These are initial operational thresholds. Review and tune them after enough
production traffic has been observed to establish normal baselines.

| Alert | Initial threshold | Evaluation period | Severity |
| --- | --- | --- | --- |
| API server-error rate | More than 5% of requests return `5xx` | 5 minutes | Critical |
| API latency | HTTP p95 exceeds 1 second | 10 minutes | Warning |
| Dependency unavailable | PostgreSQL or Redis availability is `0` | 2 minutes | Critical |
| Queue backlog | Waiting jobs exceed 100 for any queue | 10 minutes | Warning |
| Queue failures | More than 5 failed jobs in any queue | 10 minutes | Warning |
| Readiness failure | Readiness returns a non-`200` response | 2 consecutive checks | Critical |
| Container restart loop | A critical container restarts more than 3 times | 10 minutes | Critical |

Example PromQL expressions:

~~~promql
sum(rate(teamsynch_ai_http_request_errors_total[5m]))
/
clamp_min(sum(rate(teamsynch_ai_http_requests_total[5m])), 0.001)
> 0.05
~~~

~~~promql
histogram_quantile(
  0.95,
  sum by (le) (
    rate(teamsynch_ai_http_request_duration_seconds_bucket[5m])
  )
) > 1
~~~

~~~promql
min by (dependency) (
  teamsynch_ai_dependency_up
) == 0
~~~

~~~promql
max by (queue) (
  teamsynch_ai_queue_depth{state="waiting"}
) > 100
~~~

~~~promql
sum by (queue) (
  increase(teamsynch_ai_queue_jobs_failed_total[10m])
) > 5
~~~

### 9.3 Alert Investigation Procedure

1. Record the alert start time, affected route, queue, dependency, and metric
   labels before changing the system.
2. Check `/api/v1/system/live` and `/api/v1/system/ready` to distinguish an
   application failure from a PostgreSQL or Redis dependency failure.
3. Retrieve the protected metrics output and compare current request rate,
   error rate, latency, dependency state, and queue depth.
4. Search centralized API logs for the affected route and status. Use the
   request correlation ID to follow one request across warnings, errors, and
   completion logs.
5. For PostgreSQL failures, inspect API and PostgreSQL logs, connection limits,
   disk availability, migrations, and network access.
6. For Redis failures, inspect API and Redis logs, memory pressure, persistence
   errors, network access, and process health.
7. For queue backlogs, compare waiting, active, delayed, and failed counts.
   Confirm the expected workers are running and inspect worker errors.
8. Preserve failed-job data and relevant logs before retrying, deleting, or
   draining jobs.
9. Apply the smallest safe mitigation, verify readiness and metrics recovery,
   and monitor through at least one complete alert evaluation period.
10. Record the root cause, mitigation, customer impact, correlation IDs, and
    follow-up actions in the incident record.

## 10. Database Backups

The repository provides a guarded backup runner. PostgreSQL commands execute
inside the database container, so database credentials are not printed or
copied into the host shell.

The production PostgreSQL service must already be running, and the local
`.env.production` file must exist.

Create a timestamped custom-format production backup:

```bash
npm run backup:production
```

A successful command creates two ignored files under `backups/`:

- `teamsynch-ai-production-<UTC_TIMESTAMP>.dump`
- `teamsynch-ai-production-<UTC_TIMESTAMP>.dump.manifest.json`

The manifest records the backup size, SHA-256 hash, source type, applied
migration count, and representative table row counts.

Verify a selected backup through a real isolated restore:

```bash
npm run backup:verify -- backups/teamsynch-ai-production-<UTC_TIMESTAMP>.dump
```

Verification checks the hash, recreates a fresh disposable database on
`127.0.0.1:55434`, restores the archive, applies committed Prisma migrations,
and compares the restored counts with the manifest.

The workflow refuses restore targets other than the dedicated verification
database. It never restores over the source or production database.

Remove the disposable verification database:

```bash
npm run backup:cleanup
```

Run the complete deterministic local recovery drill:

```bash
npm run backup:drill
```

Copy every accepted production backup and its matching manifest to encrypted,
access-controlled storage outside the deployment host. A backup stored only on
the application host is not sufficient disaster recovery.

Use managed PostgreSQL point-in-time recovery in addition to logical backups
when available. Define retention periods and monitor backup storage capacity.

If backup creation or verification fails:

1. Do not deploy database migrations.
2. Do not edit the manifest or reuse an archive with a hash mismatch.
3. Preserve the failing archive and logs.
4. Check Docker health, disk capacity, and PostgreSQL logs.
5. Create a fresh backup and repeat the isolated verification drill.

## 11. Database Restore

A production restore is destructive and requires an approved recovery
incident. No automated command in this repository restores over production.
The `backup:verify` command is intentionally restricted to the isolated local
verification database.

Before restoring production:

1. Verify the selected archive with `npm run backup:verify`.
2. Confirm the required recovery point and matching application revision.
3. Record the approval and expected data-loss window.
4. Stop incoming traffic and background processing.
5. Preserve a final backup of the current database when it remains readable.

Stop the application services:

```bash
docker compose \
  --env-file .env.production \
  -f docker-compose.production.yml \
  stop api web
```

Production database recreation and restoration must be performed manually by
an authorized operator using the hosting provider's recovery controls or
approved PostgreSQL administration tools.

Never modify the verification runner to target the source or production
database. Never bypass its host, port, username, or database-name safeguards.

After restoration:

1. Deploy the application revision compatible with the selected backup.
2. Apply the normal committed migration workflow.
3. Start the application services.
4. Verify database connectivity, readiness, authentication, and representative
   records before reopening traffic.
5. Retain the incident logs, backup, manifest, and verification evidence.

Start the application after those checks are complete:

```bash
docker compose \
  --env-file .env.production \
  -f docker-compose.production.yml \
  up -d --no-build --wait api web
```
## 12. Rollback Policy

Prisma migrations are forward-only in the automated deployment path.

Do not attempt to reverse a production migration by deleting migration records or manually editing the Prisma migration table.

An application rollback is safe only when the previous application version is compatible with the current database schema.

For a code-only rollback:

1. Check out the last approved commit.
2. Rebuild the API and web images.
3. Start the API and web services.
4. Verify readiness and critical user journeys.

When a database migration is not backward-compatible:

1. Stop application traffic.
2. Restore the database backup taken before deployment.
3. Deploy the matching application revision.
4. Verify readiness before reopening traffic.

## 13. Staging Smoke Test

The repository includes an end-to-end production-image smoke test.

The fixture command creates a fixed test organization and user. Run it only against a disposable local or staging database.

Never run this command against a live production database:

```bash
npm run smoke:prepare-auth
```

For a disposable environment:

```bash
npm run smoke:prepare-auth

SMOKE_WEB_URL="http://127.0.0.1:${WEB_PORT:-80}" \
  npm run smoke:production
```

The smoke test verifies:

- production web assets
- absence of localhost API dependencies in the browser bundle
- API readiness through Nginx
- Socket.IO proxying
- login, refresh, `/me`, and logout
- React rendering in a headless browser

## 14. Safe Shutdown

Stop the deployment while preserving data:

```bash
docker compose \
  --env-file .env.production \
  -f docker-compose.production.yml \
  down
```

Do not add `--volumes` during a normal shutdown.

The following command permanently deletes the local PostgreSQL and Redis volumes and must only be used for intentional environment destruction:

```bash
docker compose \
  --env-file .env.production \
  -f docker-compose.production.yml \
  down --volumes
```

## 15. Persistent Data

Docker Compose manages these volumes:

- `postgres_data`
- `redis_data`
- `api_uploads`

PostgreSQL is the authoritative persistent data store.

`api_uploads` (production-readiness addition, 2026-08-06) holds document bytes uploaded through
the default LOCAL storage provider (`/app/apps/api/uploads` inside the api container). Documents
are user data as much as database rows are: the volume survives update deploys (image swap) and
must be protected accordingly.

- Not covered by `npm run backup:production` (that runner is a PostgreSQL dump). With the local
  provider, snapshot the `api_uploads` volume alongside your database backup; with
  `STORAGE_PROVIDER=s3` object durability belongs to your bucket's redundancy/versioning and this
  volume stays unused.
- Redis persistence supports queues and cache recovery but is not a substitute for PostgreSQL backups.

Monitor available disk capacity and configure automated backup retention before accepting production traffic.
