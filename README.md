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
