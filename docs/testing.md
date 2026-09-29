# Testing

Two suites, deliberately split by what they need to prove.

| Suite          | Needs a database | Command                  |
| -------------- | ---------------- | ------------------------ |
| `unit`         | No               | `npm run test:unit`      |
| `integration`  | Yes              | `npm run test:integration` |
| both           | Yes              | `npm test`               |

`npm test` runs both. If `TEST_DATABASE_URL` is not set, the integration
suite is skipped **and vitest prints a warning saying so** — a run that
silently skipped 30 tests would look identical to a green one.

---

## Running the tests

```bash
# 1. one-time: start the throwaway database (host port 5434)
cd backend
npm run test:db:up

# 2. run everything
npm test
```

Migrations are applied automatically on the first run, so a freshly created
container is all you need. The database is disposable:

```bash
npm run test:db:down     # stops it and throws the data away
```

`TEST_DATABASE_URL` is already in `backend/.env` (and `.env.example`).

### Why a separate database

The integration tests `TRUNCATE` every table between cases. Pointing them at
your development database would delete your data, so `globalSetup` refuses to
start when `TEST_DATABASE_URL` and `DATABASE_URL` name the same database.
That check is the reason the test database lives in its own compose file on
its own port rather than reusing `docker-compose.yml`.

---

## What each suite covers

### `unit` — pure logic, no database

| File | PRD requirement |
| ---- | --------------- |
| `tests/fareCalculation.test.ts` | "the evaluator must be able to test the calculation by hand using Nusrat and Rafiq's trip" (§5) |
| `tests/statusTransitions.test.ts` | "invalid state transitions are rejected" (§12) |

### `integration` — database invariants

Mocking Prisma here would prove nothing, because every guarantee below is
enforced by PostgreSQL rather than by our JavaScript.

| File | PRD requirement |
| ---- | --------------- |
| `tests/integration/poolCapacity.test.ts` | "Bullet's capacity can never be exceeded" (§12) |
| `tests/integration/concurrentSeatClaim.test.ts` | "two concurrent requests can't corrupt pool capacity" (§12) |
| `tests/integration/crossUserAccess.test.ts` | "users can't modify another user's ride" (§12) |
| `tests/integration/cancellationRules.test.ts` | "cancellation rules hold" (§12) |

All four use the PRD's cast — Jashim, Bullet, Nusrat, Rafiq, Shirin — built
fresh in `tests/helpers/cast.ts` rather than read from the seed script, so the
tests exercise the same scenario the demo does.

---

## The concurrency test (PRD §12)

> Bullet has 1 seat left. Nusrat and Shirin both try to claim it at nearly the
> same instant, and both initially see one seat available.

The fix is a single conditional update in
`src/services/pool.service.ts` → `joinExistingPool`:

```sql
UPDATE pools SET "availableSeats" = "availableSeats" - $seats
 WHERE id = $id AND status = 'OPEN' AND "availableSeats" >= $seats
```

Under `READ COMMITTED`, when a blocked `UPDATE` finally acquires the row lock,
PostgreSQL re-evaluates the `WHERE` clause against the **newly committed** row
version rather than the snapshot the transaction started with. So the loser's
`availableSeats >= $seats` test is judged against the already-decremented
value, matches zero rows, and the transaction rolls back. No `SELECT FOR
UPDATE` needed — the conditional update does the same job in one round trip.

That claim gets three tests, because each one alone leaves a gap:

1. **Deterministic.** A second raw `pg` connection takes an explicit
   `SELECT … FOR UPDATE` on the pool row and decrements the seat inside an
   uncommitted transaction. The real `acceptRideRequest` then fires, is
   asserted to still be blocked after 400 ms, and once the winner commits, must
   be refused with 409. This proves the re-evaluation happens, rather than
   hoping a race was hit.

2. **Stress.** Eight rounds of two genuinely concurrent `acceptRideRequest`
   calls on a pool with one seat left. The interleaving is random but the
   outcome is not — with one seat and two claimants exactly one can win — so
   the assertions are on aggregate counts (`availableSeats === 0`, seats taken
   `=== 3`, exactly one fulfilled and one 409), never on *which* request won.
   That is what keeps it from being flaky.

3. **Two drivers, one passenger.** A second Tesla races for the same ride
   request. The loser's whole transaction rolls back, including the pool it had
   just created, so no orphan empty trip is left behind.

### Known issue this test surfaced

In `createPoolAndJoin`, the `PoolMembership` insert happens *before* the
conditional `REQUESTED -> MATCHED` update in `matchRideRequest`. When two
drivers race for the same passenger, the loser trips the
`pool_memberships_rideRequestId` unique constraint first, so it surfaces as a
`P2002` rather than the intended `AppError(409, "no longer available")`.

The client still receives a 409 — `errorHandler` maps `P2002` — so the
behaviour is correct today, but the message is misleading. Reordering the
membership insert to after `matchRideRequest` would make the explicit guard
the real failure path while keeping the pool-then-ride lock order the cancel
path depends on. `tests/integration/concurrentSeatClaim.test.ts` currently
accepts either failure and asserts the invariants that matter either way, so
such a fix would not need this test rewritten.

---

## Notes for future tests

- **These tests are not safe to run in parallel.** They share one database and
  truncate it. `vitest.integration.config.ts` forces a single fork and
  `fileParallelism: false` — that is load-bearing, not a performance setting.
  Running the files concurrently produces unique-constraint errors that have
  nothing to do with the code under test.
- **Occupancy is counted over live memberships only.** A cancelled or completed
  passenger keeps their `PoolMembership` row as a record of having been in the
  Tesla. `maxSeats - availableSeats` is the authoritative figure, matching
  `poolShared.livePoolInclude`.
- **`createRideRequest` returns the pre-match row.** After a driver accepts, use
  the `rideRequest` on `acceptRideRequest`'s return value — `poolId` is still
  `null` on the one you booked.
- **A matched passenger still holds an active ride**, so any test looping over
  scenarios needs fresh passengers each round.
