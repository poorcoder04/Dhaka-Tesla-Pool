# Dhaka Tesla Pool

A ride-pooling platform for Dhaka: passengers request a trip between zones, and
drivers running a Tesla ("Bullet") fill their remaining seats with passengers
heading a compatible way. Fares drop as the pool fills — 30 BDT base plus
15 BDT/km, minus a pooled-seat discount of up to 30%.

> **Status:** working end to end. `docker compose up` from a clean clone gives
> you a seeded database, a REST API, and a passenger/driver web app.
> See [Known limitations](#known-limitations) for what it deliberately does not do.

## Contents

| Section | |
| --- | --- |
| [Demo accounts](#demo-accounts) | Log in as a driver or passenger |
| [Running the project](#running-the-project) | Docker, or local development |
| [Configuration](#configuration) | Every environment variable, explained |
| [Repository structure](#repository-structure) | Where things live |
| [Architecture](#architecture) | System diagram and layering |
| [API overview](#api-overview) | All 30 endpoints |
| [Key decisions and trade-offs](#key-decisions-and-trade-offs) | Why it is built this way |
| [Testing](#testing) | How to run the suites |
| [Known limitations](#known-limitations) | What this does not do |
| [Documentation](#documentation) | Longer documents |

## Demo accounts

Seeded by `prisma_runner` on first start. All four share one password.

| Person | Phone | Password | Role | Vehicle |
| --- | --- | --- | --- | --- |
| Jashim | `01700000001` | `DhakaPoolDemo123!` | Driver | Bullet (3 seats) |
| Nusrat | `01700000002` | `DhakaPoolDemo123!` | Passenger | — |
| Rafiq | `01700000003` | `DhakaPoolDemo123!` | Passenger | — |
| Shirin | `01700000004` | `DhakaPoolDemo123!` | Passenger | — |

The three-minute story, the exact fare each passenger pays, and a 13-step
walkthrough are in [`docs/demo.md`](docs/demo.md).

## Running the project

### With Docker (recommended)

A clean clone needs Docker Desktop and nothing else — no local Node, no local
Postgres.

```bash
git clone https://github.com/poorcoder04/Dhaka-Tesla-Pool.git
cd Dhaka-Tesla-Pool
docker compose up -d --build
```

- App: **http://localhost:3000**
- API: **http://localhost:5000**

The first start builds both images, so give it a few minutes. Startup is
ordered automatically: `prisma_runner` applies migrations and seeds, the
backend waits for Postgres to report healthy, and the frontend waits for the
backend's `/health` check.

Check on it with `docker compose ps`. Every service should read `healthy`
**except** `prisma_runner`, which reads `Exited (0)` — that is success. It is
a one-shot migration job, not a service that stays up.

To wipe the database and start over:

```bash
docker compose down -v && docker compose up -d --build
```

### Locally, without Docker

Use this if you want fast refresh and are running the Postgres yourself.
You need Node 22 and a PostgreSQL instance.

```bash
# 1. Backend
cd backend
npm install
cp .env.example .env          # then fix DATABASE_URL to point at your Postgres
npm run prisma:generate
npm run prisma:migrate       # creates and applies migrations
npm run prisma:seed          # seeds zones and the demo accounts
npm run dev                  # http://localhost:5000

# 2. Frontend, in a second terminal
cd frontend
npm install
npm run dev                  # http://localhost:3000
```

`npm run dev` uses `tsx watch`, so the backend restarts on save. It serves the
API only; the frontend is a separate process that talks to it over HTTP.

Useful backend scripts:

| Script | Does |
| --- | --- |
| `npm run dev` | Watch mode API server |
| `npm run build` / `npm start` | Compile to `dist/`, run the compiled server |
| `npm run prisma:migrate` | Create and apply a migration (dev) |
| `npm run prisma:migrate:prod` | Apply existing migrations (`migrate deploy`) |
| `npm run prisma:seed` | Seed zones and demo accounts |
| `npm run prisma:studio` | Browse the database in a GUI |
| `npm run db:reset` | Drop, re-migrate, re-seed |
| `npm run test:db:up` / `:down` | Start/stop the throwaway test database |

## Configuration

Defaults work for local use, so no `.env` is needed to run the Docker stack.

### Root `.env.example`

Read by `docker compose`. Copy it to `.env` to override anything:

```bash
cp .env.example .env
```

| Variable | Default | Notes |
| --- | --- | --- |
| `POSTGRES_PASSWORD` | `safe_password_here` | Password for the Postgres container. **Change before deploying.** |
| `JWT_SECRET` | `docker_jwt_secret_change_in_prod` | Signing key for auth tokens. **Change before deploying.** Anyone who knows this value can forge a token for any account, including a driver's. |
| `FRONTEND_ORIGIN` | `http://localhost:3000` | The API's CORS allowlist. Must match the real frontend origin exactly, including scheme and port, or the API rejects browser requests. |
| `NEXT_PUBLIC_API_URL` | `http://localhost:5000` | Backend URL as seen by the browser. **Read at build time** — see below. |

### Backend `.env.example`

Read by the API when running locally (`npm run dev`).

| Variable | Default | Notes |
| --- | --- | --- |
| `NODE_ENV` | `development` | `production` switches Prisma logging and error verbosity |
| `DATABASE_URL` | `postgresql://postgres:YOUR_DB_PASSWORD@localhost:5433/tesla_pool_db?schema=public` | Connection string. Only the password needs editing. |
| `JWT_SECRET` | `replace_with_a_long_random_secret_at_least_16_chars` | Must be at least 16 characters |
| `JWT_EXPIRES_IN` | `7d` | Token lifetime |
| `PORT` | `5000` | API port |
| `FRONTEND_ORIGIN` | `http://localhost:3000` | CORS allowlist, as above |
| `NEXT_PUBLIC_API_URL` | `http://localhost:5000` | Unused by the backend; present for symmetry |
| `TEST_DATABASE_URL` | `postgresql://postgres:...@localhost:5434/tesla_pool_test_db` | **Integration tests only.** The suite truncates every table between cases, so it must never point at `DATABASE_URL`. `globalSetup` refuses to run if the two name the same database. |

### `NEXT_PUBLIC_API_URL` requires an image rebuild

Next.js substitutes `NEXT_PUBLIC_*` variables into the client bundle during
`next build`. The value is frozen into the JavaScript the browser downloads,
so setting it on a running container has no effect — the container picks up
the new value and the browser never sees it.

```bash
docker compose build frontend
docker compose up -d frontend
```

A restart alone will not do it. This is the trade-off for keeping the API URL
a build argument rather than a runtime config endpoint: one fewer moving part,
at the cost of a rebuild.

## Repository structure

```
.
├── backend/                  Node 22 · Express · Prisma
│   ├── prisma/
│   │   ├── schema.prisma     8 models — source of truth for the database
│   │   ├── migrations/       Generated SQL migrations
│   │   └── seed.ts           Zones + demo accounts
│   ├── src/
│   │   ├── routes/           Method + path only, no logic
│   │   ├── middleware/       auth, role checks, Zod validation, errors
│   │   ├── controllers/      HTTP in, HTTP out
│   │   ├── services/         Business rules and transactions
│   │   ├── validators/       Zod schemas
│   │   ├── config/           env, fares, zone clusters, transitions
│   │   └── lib/prisma.ts     The only Prisma client construction
│   └── tests/                unit + integration (Vitest)
├── frontend/                 Next.js 16 · React
│   └── src/app/              Passenger and driver views
├── docs/                     Architecture, schema, testing, demo, build log
├── docker-compose.yml        postgres, prisma_runner, backend, frontend
├── docker-compose.test.yml   Throwaway database for integration tests
└── .env.example              Docker configuration template
```

### Stack

| Layer | Choice |
| --- | --- |
| Frontend | Next.js 16 (App Router), React, TypeScript |
| Backend | Node 22, Express, TypeScript (ESM) |
| Database | PostgreSQL 15, Prisma 7 with the `@prisma/adapter-pg` driver adapter |
| Validation | Zod |
| Auth | `bcryptjs` + `jsonwebtoken` (stateless JWT) |
| Testing | Vitest — unit and integration projects |
| Runtime | Docker, multi-stage production images |

## Architecture

```mermaid
flowchart TB
    subgraph Browser
        UI["Next.js client<br/>React components"]
    end

    subgraph Docker["docker compose"]
        subgraph Frontend["frontend · Next.js 16"]
            SSR["server.js<br/>standalone output"]
        end

        subgraph Backend["backend · Node 22 + Express"]
            Routes["Routes<br/>path + method only"]
            MW["Middleware<br/>auth · validate · logging"]
            Ctrl["Controllers<br/>HTTP in, HTTP out"]
            Svc["Services<br/>business rules + transactions"]
            Prisma["Prisma client<br/>@prisma/adapter-pg"]
        end

        subgraph Data["postgres:15-alpine"]
            DB[("8 tables<br/>row locks · unique indexes")]
        end

        Job["prisma_runner<br/>one-shot job"]
    end

    UI -->|"HTTP · fetch on demand"| SSR
    SSR -->|"HTTP /api/*"| Routes
    Routes --> MW --> Ctrl --> Svc --> Prisma --> DB
    Job -->|"migrate deploy + seed"| DB

    style Data fill:#eef
    style Job fill:#ffe,stroke-dasharray: 4 3
```

Every request follows the same path:

```
Route → Middleware → Controller → Service → Prisma → PostgreSQL
```

Layers import downward only. Controllers hold no business rules, routes hold
no logic at all, and **only services open transactions** — which is what keeps
a write and the rule justifying it atomic by construction.

Full detail, including why there is no Redis, no queue and no microservice
layer, is in [`docs/architecture.md`](docs/architecture.md).

**Data model:** [`docs/database-design.md`](docs/database-design.md) — [ERD
and full schema](docs/database-design.md) for the 8 tables.

## API overview

All endpoints are under `/api`. "Auth" means a valid bearer token; the role
column is enforced by `authorize()` middleware. Everything except `GET /api/zones`
requires auth.

### Auth

| Method | Endpoint | Auth | Role | Purpose |
| --- | --- | --- | --- | --- |
| POST | `/api/auth/signup` | — | — | Register. Drivers must supply vehicle details |
| POST | `/api/auth/login` | — | — | Log in, returns a JWT |
| GET | `/api/auth/me` | ✅ | Any | Current profile |

### Zones and vehicles

| Method | Endpoint | Auth | Role | Purpose |
| --- | --- | --- | --- | --- |
| GET | `/api/zones` | — | — | List all zones |
| GET | `/api/zones/:id` | — | — | One zone |
| GET | `/api/vehicles/me` | ✅ | DRIVER | Vehicles owned by the caller |
| POST | `/api/vehicles` | ✅ | DRIVER | Register a vehicle |
| PATCH | `/api/vehicles/:id` | ✅ | DRIVER | Update a vehicle |
| GET | `/api/vehicles/:id` | ✅ | Any | One vehicle |

### Ride requests

| Method | Endpoint | Auth | Role | Purpose |
| --- | --- | --- | --- | --- |
| POST | `/api/rides` | ✅ | PASSENGER | Request a trip |
| GET | `/api/rides/me` | ✅ | PASSENGER | Own ride history |
| GET | `/api/rides/open` | ✅ | DRIVER | Requests available to accept |
| POST | `/api/rides/:id/accept` | ✅ | DRIVER | Accept a request into a pool |
| PATCH | `/api/rides/:id/cancel` | ✅ | PASSENGER | Cancel, releasing the seat |
| GET | `/api/rides/:id` | ✅ | PASSENGER (owner) | One request |
| GET | `/api/rides/:id/history` | ✅ | PASSENGER (owner) | Status timeline |

### Pools and driver lifecycle

| Method | Endpoint | Auth | Role | Purpose |
| --- | --- | --- | --- | --- |
| GET | `/api/pools/me/active` | ✅ | DRIVER | Current trip and its passengers |
| GET | `/api/pools/me/history` | ✅ | DRIVER | Completed and cancelled trips |
| GET | `/api/pools/:id` | ✅ | DRIVER (owner) | One trip and all passengers |
| GET | `/api/pools/:id/history` | ✅ | DRIVER (owner) | Status timeline |
| POST | `/api/pools/:id/arrive` | ✅ | DRIVER | Mark arrived |
| POST | `/api/pools/:id/start` | ✅ | DRIVER | Start the trip |
| POST | `/api/pools/:id/complete` | ✅ | DRIVER | Complete, and settle fares |
| POST | `/api/pools/:id/cancel` | ✅ | DRIVER | Cancel before the trip starts |
| PATCH | `/api/drivers/me/status` | ✅ | DRIVER | Go online or offline |

### Fares and payments

| Method | Endpoint | Auth | Role | Purpose |
| --- | --- | --- | --- | --- |
| GET | `/api/wallet` | ✅ | Any | Wallet balance |
| POST | `/api/wallet/topup` | ✅ | Any | Add funds |
| POST | `/api/fares/estimate` | ✅ | Any | Solo vs pooled fare |
| POST | `/api/payments/:paymentId/collect` | ✅ | DRIVER | Mark a cash payment collected |
| GET | `/api/payments/ride/:rideRequestId` | ✅ | Passenger or driver | Payment for a ride |

### Lifecycle

```
Pool:   OPEN → DRIVER_ARRIVED → STARTED → COMPLETED
        (cancellable from OPEN or DRIVER_ARRIVED)

Ride:   REQUESTED → MATCHED → DRIVER_ARRIVED → STARTED → COMPLETED
        (passenger may cancel before STARTED; the seat returns to the pool)
```

A driver action updates the pool and every active passenger in one transaction.
Only online drivers can accept requests, and a driver with an active trip
cannot go offline.

## Key decisions and trade-offs

### Money is `Decimal(10,2)`, not integer poysha

**Why:** readable in the database, directly represents values like `250.50`,
and keeps the fare model simple. `NUMERIC` rather than `FLOAT` so fares sum
exactly.

**Alternative considered:** store money as integer poysha (`25050` = ৳250.50).

**Trade-off:** fare arithmetic must handle decimal precision and rounding
consistently. The implementation converts to integer poysha *inside*
`estimateFare` and converts back, so rounding happens in one place.

**When I would reconsider:** for a larger financial system with a real payment
gateway, integer minor units would remove the concern entirely.

### Password hashing with `bcryptjs` over native `bcrypt`

Pure JavaScript, so there is no node-gyp build step and no native binary
mismatch between the host machine and the Docker container. The cost is
throughput, which is irrelevant at this scale — there is no realistic
login-storm scenario for an MVP.

### Zod for all input validation

"I receive data from outside my code → I don't trust it → Zod checks it → if
valid, I use it." Applied at the middleware layer, so no controller can be
reached with an unvalidated body.

```
Client sends JSON
      ↓
Zod validation
      ↓
Valid? ── No → Return validation error
      ↓ Yes
Controller → Service → Database
```

Driver signup is a discriminated union by role: a `PASSENGER` may register with
no vehicle, a `DRIVER` must supply one. Enforced with `.superRefine()` so it
cannot be bypassed by sending the wrong role.

### JWT, not server-side sessions

Tokens are self-signed and verified against a shared secret, so authentication
is stateless and needs no session store. The trade-off is that a token cannot
be revoked before it expires — `JWT_EXPIRES_IN` defaults to 7 days.

### Conditional `UPDATE` for seat capacity, not locking clauses

The last seat is claimed by making the capacity check part of the write:

```ts
await tx.pool.updateMany({
  where: { id: poolId, status: PoolStatus.OPEN,
           availableSeats: { gte: rideRequest.seatsRequested } },
  data: { availableSeats: { decrement: rideRequest.seatsRequested } },
});
if (result.count === 0) throw new AppError("Not enough seats left in this pool", 409);
```

No `SELECT ... FOR UPDATE`, no optimistic version counter, no application
mutex. Under PostgreSQL's default `READ COMMITTED`, a blocked writer
re-evaluates its `WHERE` against the version the winner committed, so the
loser's predicate matches nothing and the transaction rolls back. **The check
and the write are the same statement, so they cannot disagree** — and because
the arbiter is the database rather than the application, this works unchanged
across any number of instances.

### No Redis, no queue, no microservices

Deliberate, not deferred. State is either already in PostgreSQL or stateless
(JWTs need no session store; `User.isOnline` is a column). There is no
background work to decouple — `setInterval` appears zero times in the repo.
The seams that do exist could be extracted, but splitting matching from pool
lifecycle would put a distributed transaction in exactly the place correctness
matters most. Reasoning in full: [`docs/architecture.md`](docs/architecture.md#3-why-there-is-no-redis-no-queue-and-no-microservices).

### Fare model

Base fare 30 BDT, distance charge 15 BDT/km, discount by pool occupancy:

| Seats in pool | Discount |
| --- | --- |
| 1 | 0% |
| 2 | 20% |
| 3+ | 30% |

Distances come from a hand-written zone-pair table rather than coordinates,
because `Zone` carries no lat/lng. Simple and predictable for Dhaka's fixed,
well-known zones; it would not extend to arbitrary geography.

## Testing

52 tests in two projects, because they are not the same kind of claim:

- **`unit`** — fare arithmetic, the state-transition tables, and the auth rate
  limiter. No database. The rate limiter is driven through a real Express app
  over a real socket, so it is tested as it actually runs.
- **`integration`** — seat capacity, the concurrent last-seat race, cross-user
  access control, cancellation rules. These are database invariants, so mocking
  Prisma would prove nothing. They run against a throwaway database on its own
  port, and `globalSetup` refuses to start if pointed at your dev database.

```bash
cd backend
npm run test:db:up    # start the throwaway database
npm test              # unit + integration
npm run test:db:down  # tear it down and drop its volume
```

The concurrency test takes a real row lock from a separate connection,
asserts the service call stays blocked, then asserts it returns 409 after the
lock is released — it proves the guarantee rather than assuming it.

Coverage details: [`docs/testing.md`](docs/testing.md).

## Known limitations

Stated plainly. Two of these are real defects, not just scope.

- **Two invariants are checked outside the transaction.** "One active ride per
  passenger" and "one active pool per driver" are both read-then-write checks
  with no database constraint behind them. Both reproduce in a **single**
  process, because every `await` is a yield point. The fix is a partial unique
  index — no new infrastructure, but it is a schema migration.
- **No `CHECK` constraints.** `availableSeats >= 0`, `seatCapacity > 0` and
  `seatsRequested > 0` are trusted to application code.
- **Payments are simulated.** An internal wallet column; transaction IDs are
  generated in-process. No payment gateway is integrated.
- **No geocoding.** Distances come from a static table; `Zone` has no
  coordinates.
- **No live updates.** No WebSocket or SSE, so a passenger does not see their
  ride matched without a refresh. Requests are fetched on demand.
- **No horizontal scaling yet, though nothing blocks it.** The backend is
  stateless, but `PrismaPg` uses `pg`'s default pool of 10 connections per
  process against Postgres's default `max_connections = 100`, so ~9 instances
  would exhaust the server. The fix is PgBouncer, not Redis.
- **The frontend has no automated tests.** The backend has 52.

## Documentation

| Document | What is in it |
| --- | --- |
| [`docs/architecture.md`](docs/architecture.md) | Layering in depth, the omissions argument, concurrency model, scaling |
| [`docs/database-design.md`](docs/database-design.md) | ERD, full schema, constraints, design notes |
| [`docs/testing.md`](docs/testing.md) | How to run the suites and what they cover |
| [`docs/demo.md`](docs/demo.md) | Demo credentials, walkthrough, fares, video outline |
| [`docs/deployment.md`](docs/deployment.md) | Deploying to Render + Neon, step by step, and the gotchas |
| [`docs/build-log.md`](docs/build-log.md) | Step-by-step record of how it was built |
