# ADR 001: Modular Monolith Architecture

## Status
Accepted

## Context
TeamSynch AI is a complex, multi-tenant enterprise SaaS platform that requires strict data isolation, high performance, and rapid feature iteration. We evaluated Microservices vs. a Monolithic architecture.
- **Microservices** offer independent scaling and deployment but introduce massive operational overhead (network latency, distributed tracing, complex CI/CD, data consistency issues).
- **Traditional Monoliths** are easy to deploy but often become "big balls of mud" with highly coupled, untestable code.

## Decision
We decided to adopt a **Modular Monolith** architecture for the backend API.
- All code lives in a single repository (`apps/api`).
- The application runs as a single deployable unit (one Docker container).
- However, the code is strictly separated into business domain modules (`src/modules/auth`, `src/modules/crm`, `src/modules/ai`, `src/modules/search`).
- Modules are not allowed to directly import controllers or internal logic from other modules. They should communicate via defined Services or asynchronous Background Jobs (via Redis/BullMQ).

## Consequences

### Positive
- **Simplicity:** A single database schema (Prisma) and a single deployment pipeline.
- **Performance:** No network latency between business modules. Data can be joined directly in the database.
- **Refactoring:** Because everything is in one TypeScript compilation unit, cross-module refactoring is safe and type-checked.
- **Operational Cost:** We only need to monitor and scale one core API service, keeping infrastructure costs extremely low during the early growth phases.

### Negative
- **Scaling Bottlenecks:** If one module (e.g., AI Generation) becomes highly CPU intensive, it scales the entire application. *(Mitigation: We implemented BullMQ to offload heavy tasks to separate Worker processes using the exact same codebase).*
- **Enforcement:** Requires strict developer discipline (or static analysis tools) to prevent modules from tightly coupling to each other.
