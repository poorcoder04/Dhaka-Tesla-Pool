import { Pool } from "pg";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "../../src/lib/prisma.js";
import { acceptRideRequest } from "../../src/services/pool.service.js";
import { expectAppError } from "../helpers/assert.js";
import { bookRide, createCast, createPassenger, type Cast } from "../helpers/cast.js";
import { resetDatabase } from "../helpers/db.js";

/**
 * PRD Section 12, the concurrency problem, verbatim:
 *
 *   "Bullet has 1 seat left. Nusrat and Shirin both try to claim it at
 *    nearly the same instant, and both initially see one seat available."
 *
 * The fix is the conditional update in joinExistingPool:
 *
 *   UPDATE pools SET availableSeats = availableSeats - $seats
 *    WHERE id = $id AND status = 'OPEN' AND availableSeats >= $seats
 *
 * Under READ COMMITTED, when a blocked UPDATE finally acquires the row lock,
 * PostgreSQL re-evaluates the WHERE clause against the newly committed row
 * version rather than the snapshot it started with. So the loser's
 * `availableSeats >= $seats` test is judged against the already-decremented
 * value, matches zero rows, and the transaction rolls back. That claim is
 * what these tests verify — twice, on purpose:
 *
 *   1. a deterministic test that forces the exact blocking scenario, so the
 *      property is proven rather than hoped for
 *   2. a repeated stress loop that lets the two requests genuinely race
 */

let cast: Cast;
let rawPool: Pool;

beforeEach(async () => {
  await resetDatabase();
  cast = await createCast();

  // A second connection to the same database, outside Prisma. Used to hold a
  // row lock that the service under test will block on.
  rawPool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
});

afterEach(async () => {
  await rawPool.end();
});

/**
 * Fills Bullet down to exactly one free seat and returns the pool id.
 *
 * Callers that run this more than once in a single test must pass fresh
 * passengers: a matched passenger still has an active ride, and the app
 * correctly refuses them a second one.
 */
async function oneSeatLeft(nusratId: string, rafiqId: string) {
  const nusrat = await bookRide(nusratId, cast.zones.banani, cast.zones.mohakhali);
  const rafiq = await bookRide(rafiqId, cast.zones.banani, cast.zones.gulshan1);

  const { pool } = await acceptRideRequest(
    cast.jashim.id,
    nusrat.id,
    cast.bullet.id,
  );
  await acceptRideRequest(cast.jashim.id, rafiq.id, cast.bullet.id);

  const seats = await prisma.pool.findUniqueOrThrow({ where: { id: pool.id } });
  expect(seats.availableSeats).toBe(1);

  return pool.id;
}

describe("concurrent seat claim", () => {
  it("re-evaluates the capacity check against the row a competing transaction just committed", async () => {
    const poolId = await oneSeatLeft(cast.nusrat.id, cast.rafiq.id);

    const shirin = await bookRide(
      cast.shirin.id,
      cast.zones.banani,
      cast.zones.mohakhali,
    );

    // Simulate the winner: another transaction that is already inside the
    // conditional update and has taken the last seat, but has not committed.
    // Taking an explicit row lock first is what makes the timing deterministic
    // instead of a race we would have to hope we won.
      const winner = await rawPool.connect();
    try {
      await winner.query("BEGIN");
      await winner.query("SELECT id FROM pools WHERE id = $1 FOR UPDATE", [poolId]);
      // Column names are camelCase: the schema maps the table (pools) but not
      // the individual columns, so they need quoting.
      await winner.query(
        `UPDATE pools
            SET "availableSeats" = "availableSeats" - 1
          WHERE id = $1 AND status = 'OPEN' AND "availableSeats" >= 1`,
        [poolId],
      );

      // Fire the real service call. It reads fine, then blocks on the pool
      // row lock held by `winner`.
      let settled = false;
      const loser = acceptRideRequest(cast.jashim.id, shirin.id).finally(() => {
        settled = true;
      });

      await new Promise((resolve) => setTimeout(resolve, 400));
      expect(settled, "the accept should still be blocked on the row lock").toBe(
        false,
      );

      // The winner commits. The blocked UPDATE now sees available_seats = 0.
      await winner.query("COMMIT");

      await expectAppError(loser, 409, "Not enough seats left");
    } finally {
      await winner.query("ROLLBACK").catch(() => undefined);
      winner.release();
    }

    const after = await prisma.pool.findUniqueOrThrow({
      where: { id: poolId },
      include: { memberships: true },
    });

    expect(after.availableSeats).toBe(0);
    expect(after.memberships).toHaveLength(2);

    const seatsTaken = after.memberships.reduce(
      (total, membership) => total + membership.seatsTaken,
      0,
    );
    expect(seatsTaken).toBe(2);
    expect(seatsTaken).toBeLessThanOrEqual(cast.bullet.seatCapacity);
  });

  it("lets exactly one of two simultaneous claims win the last seat, every time", async () => {
    // The interleaving is random, but the outcome is not: with one seat and
    // two claimants, exactly one transaction can observe available_seats >= 1
    // after the other has committed. So the aggregate assertions below hold
    // on every iteration, whichever request happens to win.
    const ITERATIONS = 8;

    for (let iteration = 0; iteration < ITERATIONS; iteration += 1) {
      // Fresh passengers every round, for all four seats involved. A matched
      // passenger still holds an active ride, so reusing anyone would be
      // testing the one-active-request rule instead of the seat race.
      const [nusrat, rafiq, first, second] = await Promise.all([
        createPassenger(`Nusrat ${iteration}`),
        createPassenger(`Rafiq ${iteration}`),
        createPassenger(`Racer A ${iteration}`),
        createPassenger(`Racer B ${iteration}`),
      ]);

      const poolId = await oneSeatLeft(nusrat.id, rafiq.id);

      const [a, b] = await Promise.all([
        bookRide(first.id, cast.zones.banani, cast.zones.mohakhali),
        bookRide(second.id, cast.zones.banani, cast.zones.mohakhali),
      ]);

      const results = await Promise.allSettled([
        acceptRideRequest(cast.jashim.id, a.id),
        acceptRideRequest(cast.jashim.id, b.id),
      ]);

      const wins = results.filter((result) => result.status === "fulfilled");
      const losses = results.filter((result) => result.status === "rejected");

      expect(wins, `iteration ${iteration}: exactly one accept should win`).toHaveLength(1);
      expect(losses, `iteration ${iteration}: exactly one accept should lose`).toHaveLength(1);

      const loss = losses[0] as PromiseRejectedResult;
      expect(loss.reason).toMatchObject({ statusCode: 409 });

      const pool = await prisma.pool.findUniqueOrThrow({
        where: { id: poolId },
        include: { memberships: true },
      });

      const seatsTaken = pool.memberships.reduce(
        (total, membership) => total + membership.seatsTaken,
        0,
      );

      expect(pool.availableSeats, `iteration ${iteration}`).toBe(0);
      expect(pool.availableSeats).toBeGreaterThanOrEqual(0);
      expect(seatsTaken, `iteration ${iteration}`).toBe(3);
      expect(seatsTaken).toBeLessThanOrEqual(cast.bullet.seatCapacity);
      expect(pool.memberships).toHaveLength(3);

      // Reset the pool back to an empty Tesla for the next round, and retire
      // the two racers so they no longer count as having an active ride.
      await prisma.rideRequest.updateMany({
        where: { id: { in: [a.id, b.id] } },
        data: { status: "CANCELLED", poolId: null, cancelledAt: new Date() },
      });
      await prisma.pool.update({
        where: { id: poolId },
        data: { availableSeats: cast.bullet.seatCapacity },
      });
      await prisma.poolMembership.deleteMany({ where: { poolId } });
    }
  });

  it("gives a contested ride request to exactly one driver, leaving no orphan pool", async () => {
    // A second Tesla, so two drivers can race for the same single passenger.
    // The winner is decided by the conditional REQUESTED -> MATCHED update in
    // matchRideRequest; the loser's whole transaction rolls back, including
    // the pool it had just created.
    await oneSeatLeft(cast.nusrat.id, cast.rafiq.id);

    const rival = await prisma.user.create({
      data: { name: "Salma", phone: "01799999999", role: "DRIVER", isOnline: true },
    });
    const comet = await prisma.vehicle.create({
      data: { ownerId: rival.id, name: "Comet", seatCapacity: 3 },
    });

    const contested = await bookRide(
      cast.nafisa.id,
      cast.zones.banani,
      cast.zones.mohakhali,
    );

    const results = await Promise.allSettled([
      acceptRideRequest(cast.jashim.id, contested.id, cast.bullet.id),
      acceptRideRequest(rival.id, contested.id, comet.id),
    ]);

    const winIndex = results.findIndex((result) => result.status === "fulfilled");
    expect(
      results.filter((result) => result.status === "fulfilled"),
      "exactly one driver should match the passenger",
    ).toHaveLength(1);

    const loss = results[winIndex === 0 ? 1 : 0] as PromiseRejectedResult;
    expect(loss.status).toBe("rejected");

    // The loser is rejected either by the explicit REQUESTED -> MATCHED guard
    // (AppError 409) or by the unique constraint on
    // pool_memberships.rideRequestId, whichever fires first today. Either way
    // the client gets a 409 — see the note below.
    const reason = loss.reason as { statusCode?: number; code?: string };
    expect(
      reason.statusCode === 409 || reason.code === "P2002",
      `unexpected loser error: ${JSON.stringify(reason)}`,
    ).toBe(true);

    // The real invariant: the loser's pool was never persisted. Jashim already
    // has a pool with one free seat, so if he won the count stays at one; if
    // Salma won, only her new pool is added.
    const jashimPools = await prisma.pool.count({
      where: { driverId: cast.jashim.id },
    });
    const salmaPools = await prisma.pool.count({
      where: { driverId: rival.id },
    });

    const jashimWon = winIndex === 0;
    expect(jashimPools).toBe(1);
    expect(salmaPools).toBe(jashimWon ? 0 : 1);

    const ride = await prisma.rideRequest.findUniqueOrThrow({
      where: { id: contested.id },
      include: { membership: true },
    });

    expect(ride.status).toBe("MATCHED");
    expect(ride.poolId).not.toBeNull();
    expect(ride.membership).not.toBeNull();

    // Exactly one membership exists for the contested request — the loser's
    // rolled back with its transaction.
    expect(
      await prisma.poolMembership.count({
        where: { rideRequestId: contested.id },
      }),
    ).toBe(1);
  });
});
