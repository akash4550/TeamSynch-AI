# Local Development Guide

## Prerequisites
- Node.js 20+
- Docker & Docker Compose (for Postgres and Redis)

## Setup Steps

1. **Environment Variables**
   Copy the example environment files:
   ```bash
   cp apps/api/.env.example apps/api/.env
   cp apps/web/.env.example apps/web/.env
   ```
   *Note: Set a secure `JWT_SECRET` in `apps/api/.env`.*

2. **Start Infrastructure**
   We use Docker to run the database and cache locally so you don't need to install Postgres or Redis directly on your machine.
   ```bash
   docker-compose up -d
   ```

3. **Database Migrations & Prisma**
   Once the database is up, push the schema and generate the TypeScript client:
   ```bash
   npm run generate -w apps/api
   npm run db:push -w apps/api
   ```

4. **Seed the Database**
   Populate the database with rich demo data:
   ```bash
   npm run seed -w apps/api
   ```
   *This creates a default user `demo@teamsynch-ai.local` with password `password123`.*

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
