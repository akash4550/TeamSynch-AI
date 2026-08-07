# Local Development Guide

## Prerequisites
- Node.js 22+
- Docker Engine and Docker Compose v2 (for PostgreSQL and Redis)

## Setup Steps

1. **Environment Variables**
   Copy the API environment example:
   ```bash
   cp apps/api/.env.example apps/api/.env
   ```
   The defaults are suitable only for local development. Use distinct, secure
   `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, and `ENCRYPTION_SECRET_KEY`
   values anywhere else.

2. **Start Infrastructure**
   We use Docker to run the database and cache locally so you don't need to install Postgres or Redis directly on your machine.
   ```bash
   docker compose up -d postgres redis
   ```

3. **Database Migrations & Prisma**
   Once the database is up, generate the TypeScript client and apply the
   committed migrations:
   ```bash
   npm run generate -w apps/api
   npm run migrate:deploy -w apps/api
   ```

4. **Seed the Database**
   Populate the database with rich demo data:
   ```bash
   npm run seed -w apps/api
   ```
   Sign in with workspace `00000000-0000-4000-8000-000000000001`, email
   `demo@teamsynch-ai.com`, and password `password123`.

5. **Run the Application**
   Start both the backend API and frontend Vite dev server concurrently:
   ```bash
   npm run dev
   ```
   - API: `http://localhost:4000`
   - Web: `http://localhost:5173`

## Running Tests
```bash
npm run test
```
