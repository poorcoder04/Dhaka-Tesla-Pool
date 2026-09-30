# Working flow and commands

The everyday reference: how the pieces fit together, what to run, and which
command to reach for when something looks wrong.

For setup from a clean clone, see the [README](../README.md#running-the-project).
For the deployed version, see [`deployment.md`](deployment.md).

---

## The mental model

Four layers, each with one job:

```text
Browser
   ↕  HTTP
Next.js Frontend   (port 3000)
   ↕  HTTP/REST
Express Backend    (port 5000)
   ↕  Prisma
PostgreSQL         (port 5433)
```

Each runs independently. Start them separately and restart only the one you
changed. In Docker, Compose starts them in order for you.

**All commands below assume PowerShell on Windows.** Two differences from a Unix
shell matter throughout:

- Use `curl.exe`, not `curl`. PowerShell aliases `curl` to `Invoke-WebRequest`,
  which has different flags and prompts for confirmation — `curl` alone will
  not work.
- Line continuation is a backtick `` ` `` at end of line, not `\`.

---

## Repository layout

```text
backend/
├── src/
│   ├── index.ts                 entry point; mounts routes, starts the server
│   ├── routes/                  URL definitions only, no logic
│   │   ├── auth.route.ts
│   │   ├── driver.route.ts
│   │   ├── payment.route.ts
│   │   ├── pool.route.ts
│   │   ├── rideRequest.route.ts
│   │   ├── vehicle.route.ts
│   │   └── zone.route.ts
│   ├── controllers/             HTTP in, HTTP out; still no business rules
│   ├── services/                business rules and the only place transactions open
│   ├── middleware/              auth, validation, rate limits, logging, errors
│   ├── validators/              Zod schemas, one per resource
│   ├── config/                  env parsing, fare tiers, zones, status transitions
│   ├── utils/                   fare estimate, JWT, password, AppError, safeUser
│   ├── types/                   ambient Express type augmentation
│   └── lib/prisma.ts            the single shared PrismaClient instance
├── prisma/
│   ├── schema.prisma            table definitions
│   ├── migrations/              generated SQL history — do not hand-edit
│   └── seed.ts                  Jashim + Bullet, Nusrat, Rafiq, Shirin
├── tests/                       Vitest unit and integration suites
├── generated/prisma/            generated Prisma client — do not hand-edit
├── Dockerfile                   multi-stage: deps → build → prod-deps → migrate → runtime
├── prisma.config.ts
└── .env                         local secrets; git-ignored

frontend/
├── src/app/                     App Router pages
├── src/components/              passenger, driver and shared UI
└── Dockerfile                   multi-stage: deps → builder → runner

docs/                            this file and the rest of the long-form docs
docker-compose.yml               the four-service dev stack
docker-compose.test.yml          throwaway database for integration tests
```

The rule the layering enforces: imports point **downward** only. Routes call
controllers, controllers call services, services are the only layer that
touches Prisma and the only one that opens a transaction. That is what makes a
write and the rule justifying it atomic by construction.

---

## Seeing your data — three ways

### Prisma Studio (visual)

```powershell
cd backend
npx prisma studio
```

Opens http://localhost:5555. All tables, all rows, editable. The fastest way to
confirm a write actually happened.

### Migration status

```powershell
cd backend
npx prisma migrate status
```

Reports which migrations are applied and whether the database matches
`schema.prisma`. Run this first whenever a query fails against a column you
believe exists.

### psql, raw SQL

```powershell
docker compose exec postgres psql -U postgres -d tesla_pool_db
```

Then inside `psql`:

```sql
\dt                -- list tables
\d users           -- describe one table
SELECT * FROM zones;
\q                 -- quit
```

> Use `docker compose exec`, not `docker exec`. The Compose services have no
> fixed `container_name` — it was removed so two stacks can run side by side —
> so there is no stable name to address. `docker compose exec` finds it for you.

For the throwaway test database, point the file flag at the `exec`:

```powershell
docker compose -f docker-compose.test.yml exec postgres-test psql -U postgres -d tesla_pool_test_db
```

---

## Running the stack

### Everything, the way it deploys

```powershell
# from the repository root
docker compose up --build
```

Order is enforced by health checks: Postgres reports healthy → `prisma_runner`
applies migrations and seeds, then exits → backend waits for the runner →
frontend waits for the backend's `/health`.

```powershell
docker compose ps            # check status
docker compose logs -f backend
docker compose down          # stop, keep the database
docker compose down -v       # stop and delete the database volume
```

### Just the database

Useful when running the backend on the host with `npm run dev`, so you get fast
reloads instead of rebuilding an image.

```powershell
docker compose up postgres -d
```

### Backend only, on the host

```powershell
cd backend
npm install
cp .env.example .env        # PowerShell: Copy-Item .env.example .env
npm run dev
```

`tsx watch` restarts on save. Check it:

```powershell
curl.exe -s http://localhost:5000/health
# {"status":"ok","timestamp":"..."}

curl.exe -s http://localhost:5000/
# {"message":"Dhaka Tesla Pool API","version":"1.0.0"}
```

### Frontend only, on the host

```powershell
cd frontend
npm install
npm run dev
```

Both must be running at once — the frontend calls the API directly from the
browser, not through a proxy.

### The whole daily loop

```powershell
# terminal 1 — from the repository root
docker compose up postgres -d

# terminal 2
cd backend
npm run dev

# terminal 3, optional
cd backend
npx prisma studio
```

---

## Testing an endpoint by hand

```powershell
# public
curl.exe -s http://localhost:5000/api/zones

# authenticated — log in first and reuse the token
curl.exe -s -X POST http://localhost:5000/api/auth/login `
  -H "Content-Type: application/json" `
  -d '{\"phone\":\"01700000001\",\"password\":\"DhakaPoolDemo123!\"}'

curl.exe -s http://localhost:5000/api/pools/me/active `
  -H "Authorization: Bearer <token>"
```

> **Escape the quotes in the JSON body.** PowerShell strips bare `"` before the
> argument reaches a native executable, so `-d '{"phone":"017..."}'` arrives as
> `{phone:017...}` and the server answers 500 with a JSON parse error. The
> backslashes above are load-bearing. Thunder Client and Postman sidestep this
> entirely, which is why they are worth installing.

Thunder Client or Postman is easier for anything with a request body.

Two things to expect rather than debug:

- **429** after 10 failed logins from one IP in 15 minutes, or 20 signups in an
  hour. Only *failed* logins count, so mistyping twice then succeeding is fine.
- **401** when the token is missing or expired; tokens last 7 days by default.

---

## Changing the database schema

Follow this order every time.

```text
edit prisma/schema.prisma
        ↓
prisma migrate dev --name describe_the_change
        ↓
Prisma writes the SQL and regenerates the client
        ↓
your TypeScript picks up the new types immediately
        ↓
tsx watch has already restarted the backend
```

```powershell
cd backend
npx prisma migrate dev --name add_driver_online_status
```

- `migrate dev` regenerates the client for you. Run `npx prisma generate`
  separately only if types still look stale.
- `npm run db:reset` drops everything, replays every migration and reseeds.
  Development only.
- In production use `npm run prisma:migrate:prod`, which is `migrate deploy` —
  it applies pending migrations and never prompts. The Docker `migrate` stage and
  the Render release command both use it.

Name migrations after the change, not the tool. These read well in a history;
`add_field2` does not.

---

## Running the tests

```powershell
cd backend
npm run test:db:up     # start the throwaway database on port 5434
npm test               # 52 tests: unit + integration
npm run test:db:down   # tear it down and drop its volume
```

Narrower:

```powershell
npm run test:unit
npm run test:integration
npm run test:watch
```

If `npm test` dies with `fatal error: runtime: cannot allocate memory`, the
machine is out of RAM, not the suite. Vitest's default worker pool starts one
process per core; on a low-memory machine that is what runs it out. Run it
serially instead:

```powershell
npx vitest run --pool=forks --poolOptions.forks.singleFork
```

> The integration suite **truncates every table between cases**. It uses the
> separate database in `docker-compose.test.yml`, on port 5434, and `globalSetup`
> refuses to start if `TEST_DATABASE_URL` and `DATABASE_URL` name the same
> database. That check is deliberate — please do not remove it.

---

## The golden rules

| Situation | Do this |
| --- | --- |
| Changed a `.ts` file in `src/` | Nothing — `tsx watch` restarts |
| Changed `schema.prisma` | `npx prisma migrate dev --name xyz` |
| Types look stale | `npx prisma generate` |
| Want to see table data | `npx prisma studio` |
| Want to wipe the dev database | `npm run db:reset` |
| Testing one endpoint | `curl.exe`, or Thunder Client |
| Ready to test the full stack | `docker compose up --build` |
| Something 500s after a schema change | `npx prisma migrate status` |

---

## Environment variables

Two files, both with working defaults. Copy the examples only if you need to
override something.

**Root `.env`** — read by Compose:

| Variable | Default | Notes |
| --- | --- | --- |
| `POSTGRES_PASSWORD` | `safe_password_here` | Local only |
| `JWT_SECRET` | `docker_jwt_secret_change_in_prod` | **Change outside local dev.** Min 16 chars, enforced at boot |
| `FRONTEND_ORIGIN` | `http://localhost:3000` | Must match the browser-visible origin exactly, or CORS rejects |
| `NEXT_PUBLIC_API_URL` | `http://localhost:5000` | **Build-time, not runtime — see below** |
| `POSTGRES_PORT` / `BACKEND_PORT` / `FRONTEND_PORT` | `5433` / `5000` / `3000` | Change these to run two stacks side by side |

**`backend/.env`** — read by the backend directly:

| Variable | Default | Notes |
| --- | --- | --- |
| `DATABASE_URL` | required | Connection string |
| `JWT_SECRET` | required, min 16 chars | Boot fails fast without it |
| `JWT_EXPIRES_IN` | `7d` | |
| `PORT` | `5000` | |
| `NODE_ENV` | `development` | |
| `FRONTEND_ORIGIN` | `http://localhost:3000` | CORS allow-list |
| `TEST_DATABASE_URL` | port 5434, test DB | Integration tests only |

The backend validates these with Zod on boot and exits with a readable error if
anything is missing — so a bad `JWT_SECRET` fails immediately rather than at the
first login.

### `NEXT_PUBLIC_API_URL` needs a rebuild

This one bites. Next.js substitutes `NEXT_PUBLIC_*` into the client bundle
during `next build`, so the browser downloads JavaScript that was frozen at
build time. Setting it on a running container does nothing.

```powershell
docker compose build frontend
docker compose up -d frontend
```

A plain `restart` silently keeps the old value. If a change appears not to take,
check the network tab in browser devtools for the URL actually being requested.

---

## Deploying

`render.yaml` describes the two web services. Full instructions, including the
Neon database setup and the gotchas, are in
[`deployment.md`](deployment.md).

```powershell
# migrations against the deployed database
cd backend
npm run prisma:migrate:prod
```

- **Live app:** https://dhaka-tesla-pool-web-9ejc.onrender.com
- **Live API:** https://dhaka-tesla-pool-api-eza3.onrender.com

First request after ~15 minutes idle takes 30–50 seconds while the free-tier
service wakes. Wait it out; it is not an application error.

Secrets live in the host's dashboard, never in the repository.

---

## Editor setup

- **Prisma** — syntax highlighting for `schema.prisma`
- **Thunder Client** — call API endpoints without leaving the editor
- **ESLint** — catches problems as you type; `cd frontend && npm run lint`
