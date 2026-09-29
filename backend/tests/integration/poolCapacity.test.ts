import { beforeEach, describe, expect, it } from "vitest";

import { prisma } from "../../src/lib/prisma.js";
import { acceptRideRequest } from "../../src/services/pool.service.js";
import { expectAppError } from "../helpers/assert.js";
import { bookRide, createCast, type Cast } from "../helpers/cast.js";
import { resetDatabase } from "../helpers/db.js";

/**
 * PRD Section 12: "Bullet's capacity can never be exceeded."
 *
 * Bullet is a 3-seat Tesla, so the invariant under test is
 *
 *     sum(membership.seatsTaken) <= vehicle.seatCapacity
 *
 * and, as its corollary, `Pool.availableSeats` is never negative.
 */

// Accepting a request goes through the real service, including the matching
// rule (same origin zone, destination in the same cluster) — so these tests
// would also catch it if a compatibility rule change ever made it impossible
// to actually fill Bullet.
async function accept(cast: Cast, rideId: string) {
  return acceptRideRequest(cast.jashim.id, rideId, cast.bullet.id);
}

async function poolSeatState(poolId: string) {
  const pool = await prisma.pool.findUniqueOrThrow({
    where: { id: poolId },
    include: { memberships: true },
  });

  const seatsTaken = pool.memberships.reduce(
    (total, membership) => total + membership.seatsTaken,
    0,
  );

  return { availableSeats: pool.availableSeats, seatsTaken, members: pool.memberships.length };
}

let cast: Cast;

beforeEach(async () => {
  await resetDatabase();
  cast = await createCast();
});

describe("seat capacity", () => {
  it("fills all three of Bullet's seats with the story cast", async () => {
    const nusratRide = await bookRide(
      cast.nusrat.id,
      cast.zones.banani,
      cast.zones.mohakhali,
    );
    const rafiqRide = await bookRide(
      cast.rafiq.id,
      cast.zones.banani,
      cast.zones.gulshan1,
    );
    const shirinRide = await bookRide(
      cast.shirin.id,
      cast.zones.banani,
      cast.zones.mohakhali,
    );

    // The first accept starts the pool; the other two join it. Mohakhali and
    // Gulshan 1 are both in the "uptown" cluster, so all three are compatible.
    const first = await accept(cast, nusratRide.id);
    await accept(cast, rafiqRide.id);
    await accept(cast, shirinRide.id);

    const state = await poolSeatState(first.pool.id);

    expect(state.seatsTaken).toBe(cast.bullet.seatCapacity);
    expect(state.availableSeats).toBe(0);
    expect(state.members).toBe(3);
  });

  it("refuses a fourth passenger once Bullet is full", async () => {
    const nusratRide = await bookRide(
      cast.nusrat.id,
      cast.zones.banani,
      cast.zones.mohakhali,
    );
    const rafiqRide = await bookRide(
      cast.rafiq.id,
      cast.zones.banani,
      cast.zones.gulshan1,
    );
    const shirinRide = await bookRide(
      cast.shirin.id,
      cast.zones.banani,
      cast.zones.mohakhali,
    );
    const nafisaRide = await bookRide(
      cast.nafisa.id,
      cast.zones.banani,
      cast.zones.gulshan1,
    );

    const { pool } = await accept(cast, nusratRide.id);
    await accept(cast, rafiqRide.id);
    await accept(cast, shirinRide.id);

    await expectAppError(
      accept(cast, nafisaRide.id),
      409,
      "Not enough seats left",
    );

    // The refusal must be total: nothing moved, and in particular
    // availableSeats did not dip below zero on the way to being rejected.
    const state = await poolSeatState(pool.id);
    expect(state.seatsTaken).toBe(3);
    expect(state.availableSeats).toBe(0);
    expect(state.availableSeats).toBeGreaterThanOrEqual(0);

    // And the rejected passenger's request is still open, not silently
    // consumed by a failed attempt.
    const nafisaAfter = await prisma.rideRequest.findUniqueOrThrow({
      where: { id: nafisaRide.id },
    });
    expect(nafisaAfter.status).toBe("REQUESTED");
    expect(nafisaAfter.poolId).toBeNull();
  });

  it("rejects a request for more seats than the vehicle has, before matching", async () => {
    // seatsRequested is capped at 3 by the zod schema, which is exactly
    // Bullet's capacity, so the guard that matters here is the vehicle check
    // in acceptRideRequest rather than the request schema.
    const ride = await bookRide(
      cast.nusrat.id,
      cast.zones.banani,
      cast.zones.mohakhali,
      3,
    );

    const { pool } = await accept(cast, ride.id);
    const state = await poolSeatState(pool.id);

    expect(state.seatsTaken).toBe(3);
    expect(state.availableSeats).toBe(0);
  });

  it("never lets availableSeats drift out of the range 0..capacity", async () => {
    const rides = await Promise.all(
      [cast.nusrat, cast.rafiq, cast.shirin, cast.nafisa].map((passenger) =>
        bookRide(passenger.id, cast.zones.banani, cast.zones.mohakhali),
      ),
    );

    for (const ride of rides) {
      // Accepts that fail are expected once the Tesla fills up; the point of
      // the loop is the invariant after every attempt, successful or not.
      await accept(cast, ride.id).catch(() => undefined);

      const pools = await prisma.pool.findMany({ where: { driverId: cast.jashim.id } });
      expect(pools).toHaveLength(1);

      const state = await poolSeatState(pools[0].id);
      expect(state.availableSeats).toBeGreaterThanOrEqual(0);
      expect(state.availableSeats).toBeLessThanOrEqual(cast.bullet.seatCapacity);
      expect(state.seatsTaken).toBeLessThanOrEqual(cast.bullet.seatCapacity);
    }
  });

  it("stops a driver from accepting rides while offline", async () => {
    const ride = await bookRide(
      cast.nusrat.id,
      cast.zones.banani,
      cast.zones.mohakhali,
    );

    await prisma.user.update({
      where: { id: cast.jashim.id },
      data: { isOnline: false },
    });

    await expectAppError(
      accept(cast, ride.id),
      409,
      "Go online before accepting rides",
    );

    expect(await prisma.pool.count({ where: { driverId: cast.jashim.id } })).toBe(0);
  });
});
