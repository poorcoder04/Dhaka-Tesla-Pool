## Key Decisions & Trade-offs

### Money Representation

`Payment.amount` is stored as `Decimal(10,2)` rather than integer
poysha.

**Why:**
- Keeps monetary values readable in the database.
- Directly represents amounts such as `250.50`.
-  simple fare model.

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
 vehicle optional   vehicle REQUIRED
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
| GET    | `/vehicles/me`  | ✅              | DRIVER                 | —             | `listMine` |
| POST   | `/vehicles`     | ✅              | DRIVER                 | Create schema | `create`   |
| PATCH  | `/vehicles/:id` | ✅              | DRIVER                 | Update schema | `update`   |
| GET    | `/vehicles/:id` | ✅              | Any authenticated user | —             | `getOne`   |

### API ENDPOINT:
## zone: 
1. GET /api/zones 
2. GET /api/zones/:id  (public, no auth) (zones are seed only)
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
| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/api/rides` | PASSENGER | `{ originZoneId, destinationZoneId, seatsRequested? }` (seatsRequested defaults to 1, max 3) |
| GET | `/api/rides/me` | PASSENGER | own history, newest first |
| GET | `/api/rides/:id` | PASSENGER (owner only) | 403 if you don't own it |
| PATCH | `/api/rides/:id/cancel` | PASSENGER (owner only) | 409 if status isn't still `REQUESTED` |

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