## Key Decisions & Trade-offs

### Money Representation

`Payment.amount` is stored as `Decimal(10,2)` rather than integer
poysha.

**Why:**

- Keeps monetary values readable in the database.
- Directly represents amounts such as `250.50`.
- simple fare model.

**Alternative considered:**

- Store money as integer poysha (`25050` = ৳250.50).

**Trade-off:**

- Decimal is more readable, but fare calculations must handle
  decimal precision and rounding consistently.

**When I would reconsider:**

- For a larger financial/payment system, I would consider integer
  minor units such as poysha to eliminate decimal arithmetic
  concerns.

### password hasing decision

- bcryptjs over native bcrypt: pure JS, no node-gyp/native binary mismatch
- risk between your host machine and the Docker container — worth the small
- throughput cost for an MVP with no realistic login-storm scale concern.

### input validation

-using zod
-"I receive data from outside my code → I don't trust it → Zod checks it → if valid, I use it."

### jwt token generation

-you need vechile information for sign up as a driver(using .superRefine())

              Signup
                │
        ┌───────┴────────┐
        │                │
    PASSENGER          DRIVER
        │                │

vehicle optional vehicle REQUIRED
│
↓
createVehicleSchema

### zod validation

Client sends JSON
↓
Zod validation
↓
Valid? ── No → Return validation error
↓ Yes
Controller
↓
Service
↓
Database

### flow

Request
↓
Route
↓
Middleware
↓
Controller
↓
Service
↓
Prisma
↓
PostgreSQL

### vechicle feature flow

GET /vehicles/me
↓
authenticate
↓
authorize("DRIVER")
↓
listMine controller
↓
listMyVehicles service
↓
Prisma

| Method | Endpoint        | Authentication | Role                   | Validation    | Controller |
| ------ | --------------- | -------------- | ---------------------- | ------------- | ---------- |
| GET    | `/vehicles/me`  | ✅             | DRIVER                 | —             | `listMine` |
| POST   | `/vehicles`     | ✅             | DRIVER                 | Create schema | `create`   |
| PATCH  | `/vehicles/:id` | ✅             | DRIVER                 | Update schema | `update`   |
| GET    | `/vehicles/:id` | ✅             | Any authenticated user | —             | `getOne`   |

### API ENDPOINT:

## zone:

1. GET /api/zones
2. GET /api/zones/:id (public, no auth) (zones are seed only)

## vehicle :

1. POST /api/vehicles (create vehicle information, need authentication(token),authorization(driver), vehicle information(name, model, plateNumber, seatCapacity))

2. GET /api/vehicles/me(for listing the vehicles of a driver. need: auth)

3. GET /api/vehicles/:id, (driver or passenger see the vehicle information with provide vehicle id, need :auth)

4. PATCH /api/vehicles/:id (update vehicle information, need : token, vehicle data, vehicle id)

# Step 4 — Ride Requests

## New/changed files

- `src/validators/rideRequest.validator.ts` — new
- `src/utils/estimateFare.ts` — new (placeholder fare estimator, isolated for Step 7)
- `src/services/rideRequest.service.ts` — new
- `src/controllers/rideRequest.controller.ts` — new
- `src/routes/rideRequest.route.ts` — new
- `src/index.ts` — **replaces your existing file**: added the `rideRequestRouter`
  import + `app.use("/api/rides", rideRequestRouter)` line, updated the TODO
  comment. Nothing else changed .

Everything else (schema, auth, vehicles, zones) is untouched.

## Endpoints

| Method | Path                    | Auth                   | Notes                                                                                        |
| ------ | ----------------------- | ---------------------- | -------------------------------------------------------------------------------------------- |
| POST   | `/api/rides`            | PASSENGER              | `{ originZoneId, destinationZoneId, seatsRequested? }` (seatsRequested defaults to 1, max 3) |
| GET    | `/api/rides/me`         | PASSENGER              | own history, newest first                                                                    |
| GET    | `/api/rides/:id`        | PASSENGER (owner only) | 403 if you don't own it                                                                      |
| PATCH  | `/api/rides/:id/cancel` | PASSENGER (owner only) | 409 if status isn't still `REQUESTED`                                                        |

## Decisions implemented

- One active (`REQUESTED`/`MATCHED`) request per passenger at a time → 409 on a second attempt.
- `originZoneId !== destinationZoneId` enforced in the zod schema.
- `estimateFare()` returned in the `POST /api/rides` response only — never written to `Payment`.
- `RideStatusHistory` row written on both create and cancel.

## Quick manual test (after `npm run dev`, logged in)

```bash
# get a token first via POST /api/auth/login, then:

# list zones to grab ids
curl http://localhost:3000/api/zones

# create a request
curl -X POST http://localhost:3000/api/rides \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"originZoneId":"<banani-id>","destinationZoneId":"<mohakhali-id>","seatsRequested":1}'

# try creating a 2nd one -> expect 409

# view own history
curl http://localhost:3000/api/rides/me -H "Authorization: Bearer <TOKEN>"

# cancel
curl -X PATCH http://localhost:3000/api/rides/<id>/cancel -H "Authorization: Bearer <TOKEN>"
```

## step that are still pending

- Driver "see relevant requests" + "accept" → Step 5, alongside `Pool` creation.
- Real fare formula / persisted `Payment` → Step 7.
- Any status beyond `REQUESTED`/`CANCELLED` → Step 5/6.

### step-5: pool matching engine

| API                       | Who       | Simple meaning                    |
| ------------------------- | --------- | --------------------------------- |
| `GET /rides/open`         | Driver    | **Show me passengers waiting**    |
| `POST /rides/:id/accept`  | Driver    | **I want to take this passenger** |
| `GET /pools/me/active`    | Driver    | **Show me my current trip/pool**  |
| `PATCH /rides/:id/cancel` | Passenger | **I want to cancel my ride**      |

### flow diagram:

Passenger creates ride
↓
REQUESTED
↓
GET /api/rides/open
↑
Driver sees available passengers
↓
POST /api/rides/:id/accept
↓
REQUESTED → MATCHED
↓
Passenger joins driver's Pool
↓
GET /api/pools/me/active
↓
Driver sees:
vehicle
passengers
seats
zones
↓
Passenger changes mind?
↓
PATCH /api/rides/:id/cancel
↓
MATCHED → CANCELLED
↓
seat returned to Pool

## Step 6 — Driver Flow & Pool Lifecycle

Step 6 adds the driver's trip controls, online/offline status, lifecycle
transitions, and status history for pools and ride requests.

### Driver endpoints

| Method | Path                      | Meaning                                |
| ------ | ------------------------- | -------------------------------------- |
| PATCH  | `/api/drivers/me/status`  | Go online or offline                   |
| GET    | `/api/pools/me/active`    | View the active trip and passengers    |
| GET    | `/api/pools/me/history`   | View completed and cancelled trips     |
| GET    | `/api/pools/:id`          | View one owned trip and all passengers |
| GET    | `/api/pools/:id/history`  | View the trip status timeline          |
| POST   | `/api/pools/:id/arrive`   | Mark the driver as arrived             |
| POST   | `/api/pools/:id/start`    | Start the trip                         |
| POST   | `/api/pools/:id/complete` | Complete the trip                      |
| POST   | `/api/pools/:id/cancel`   | Cancel before the trip starts          |

### Passenger history endpoint

| Method | Path                     | Meaning                                |
| ------ | ------------------------ | -------------------------------------- |
| GET    | `/api/rides/:id/history` | View the passenger's own ride timeline |

### Lifecycle rules

- Pool: `OPEN → DRIVER_ARRIVED → STARTED → COMPLETED`
- Pool cancellation is allowed from `OPEN` or `DRIVER_ARRIVED`.
- Ride: `REQUESTED → MATCHED → DRIVER_ARRIVED → STARTED → COMPLETED`
- Passengers may cancel before `STARTED`.
- Driver actions update the pool and all active passengers in one transaction.
- Only online drivers can accept ride requests, and drivers cannot go offline during an active trip.

### Step 6 validation

## Step 7 — Fare Calculation & Payment System

Step 7 adds the real pricing engine and payment flow for Dhaka Tesla Pool. It replaces the placeholder fare helper with a zone-aware calculation that applies pooled seat discounts and persists the money logic in the application service layer.

### What was added

- `backend/src/config/fareConfig.ts` — fare constants and zone distance map
- `backend/src/utils/estimateFare.ts` — real fare calculation logic with proper discount tiers
- `backend/src/controllers/payment.controller.ts` — wallet, top-up, estimation, and cash collection endpoints
- `backend/src/services/payment.service.ts` — wallet balance logic and payment retrieval logic
- `backend/src/routes/payment.route.ts` — payment routes mounted to the API
- `backend/src/validators/payment.validator.ts` — validation for wallet and fare estimation payloads
- `backend/tests/fareCalculation.test.ts` — unit checks for the PRD fare examples

### Payment endpoints

| Method | Path                                | Auth                | Meaning                         |
| ------ | ----------------------------------- | ------------------- | ------------------------------- |
| GET    | `/api/wallet`                       | Authenticated user  | View wallet balance             |
| POST   | `/api/wallet/topup`                 | Authenticated user  | Add value to wallet             |
| POST   | `/api/fares/estimate`               | Authenticated user  | Estimate solo vs pooled fare    |
| POST   | `/api/payments/:paymentId/collect`  | Driver              | Mark cash payment as collected  |
| GET    | `/api/payments/ride/:rideRequestId` | Passenger or driver | View payment details for a ride |

### Business rules

- Base fare is `30` BDT and distance charge is `15` BDT per km
- Discount is applied based on occupied seats in the pool:
  - 1 seat: `0%`
  - 2 seats: `20%`
  - 3+ seats: `30%`
- Calculations are done in poysha first, then converted to a decimal-friendly BDT representation for storage
- The main app now mounts the payment router in `backend/src/index.ts`

### Manual verification

```bash
cd backend
npm test -- --run tests/fareCalculation.test.ts
```

This confirms the Step 7 fare examples match the PRD expectations for Banani → Mohakhali and Banani → Gulshan 1 scenarios.

```bash
npm test
```

### api endpoint summary table for step-06

| Method  | Endpoint                  | Who       | Purpose                   |
| ------- | ------------------------- | --------- | ------------------------- |
| `PATCH` | `/api/drivers/me/status`  | Driver    | Go **online/offline**     |
| `GET`   | `/api/pools/active`       | Driver    | Get driver's active pool  |
| `GET`   | `/api/pools/:id`          | Driver    | Get pool details          |
| `GET`   | `/api/pools/history`      | Driver    | Get driver's pool history |
| `GET`   | `/api/pools/:id/timeline` | Driver    | Get pool/ride timeline    |
| `POST`  | `/api/pools/:id/arrive`   | Driver    | Mark driver as arrived    |
| `POST`  | `/api/pools/:id/start`    | Driver    | Start the trip            |
| `POST`  | `/api/pools/:id/complete` | Driver    | Complete the trip         |
| `POST`  | `/api/pools/:id/cancel`   | Driver    | Cancel the pool/trip      |
| `GET`   | `/api/rides/:id/history`  | Passenger | Get ride request history  |

### Step 8 (in progress) — test suite

See **[docs/testing.md](docs/testing.md)** for the full write-up: how to run
the suites, what each PRD §12 requirement is covered by, and how the
concurrency test proves the last-seat race is handled.

The suite is split in two, because the requirements are not the same kind of
claim:

- **`unit`** — fare arithmetic and the state-transition tables. Pure logic, no
  database, runs anywhere.
- **`integration`** — seat capacity, the concurrent seat-claim race,
  cross-user access control and cancellation rules. These are database
  invariants: the guarantee lives in PostgreSQL's row locking, so mocking
  Prisma would prove nothing. They run against a throwaway database in
  `docker-compose.test.yml` on its own port, and `globalSetup` refuses to run
  if it is pointed at your development database.

```bash
cd backend
npm run test:db:up    # start the throwaway database on :5434
npm test              # unit + integration
```

