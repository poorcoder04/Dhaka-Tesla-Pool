import { beforeEach, describe, expect, it } from "vitest";

import { prisma } from "../../src/lib/prisma.js";
import {
  cancelTrip,
  markArrived,
  startTrip,
} from "../../src/services/poolLifecycle.service.js";
import { acceptRideRequest } from "../../src/services/pool.service.js";
import { cancelRideRequest } from "../../src/services/rideRequest.service.js";
import { expectAppError } from "../helpers/assert.js";
import { bookRide, createCast, type Cast } from "../helpers/cast.js";
import { resetDatabase } from "../helpers/db.js";

/**
 * PRD Section 12: "cancellation rules hold."
 *
 * The suggested lifecycle is REQUESTED -> MATCHED -> DRIVER_ARRIVED ->
 * STARTED -> COMPLETED, with cancellation allowed anywhere before STARTED.
 * The interesting part is not the status flip — the unit tests in
 * tests/statusTransitions.test.ts already cover the transition table — but
 * what cancellation does to the pool's seat count. A cancel that forgets to
 * hand the seat back would leave Bullet permanently one seat short, and a
 * cancel that hands it back after STARTED would put a passenger in a moving
 * car who is no longer counted as aboard.
 */

let cast: Cast;

beforeEach(async () => {
  await resetDatabase();
  cast = await createCast();
});

/** Jashim picks up Nusrat and Rafiq: 2 of 3 seats used, 1 free. */
async function twoInBullet() {
  const nusrat = await bookRide(
    cast.nusrat.id,
    cast.zones.banani,
    cast.zones.mohakhali,
  );
  const rafiq = await bookRide(
    cast.rafiq.id,
    cast.zones.banani,
    cast.zones.gulshan1,
  );

  const accepted = await acceptRideRequest(
    cast.jashim.id,
    nusrat.id,
    cast.bullet.id,
  );
  await acceptRideRequest(cast.jashim.id, rafiq.id, cast.bullet.id);

  return { poolId: accepted.pool.id, nusratId: nusrat.id, rafiqId: rafiq.id };
}

/**
 * Occupancy, as the rest of the app computes it.
 *
 * A cancelled passenger keeps their PoolMembership row as a record of having
 * been in the Tesla — the same way a completed one does — so counting all
 * membership rows would overstate occupancy. The live figure is
 * maxSeats - availableSeats, and the members still counted are those whose
 * ride is MATCHED, DRIVER_ARRIVED or STARTED, which is exactly the filter
 * poolShared.livePoolInclude applies.
 */
async function seatsOf(poolId: string) {
  const pool = await prisma.pool.findUniqueOrThrow({
    where: { id: poolId },
    include: {
      memberships: { include: { rideRequest: { select: { status: true } } } },
    },
  });

  const seatsTaken = pool.memberships
    .filter((membership) =>
      ["MATCHED", "DRIVER_ARRIVED", "STARTED"].includes(
        membership.rideRequest.status,
      ),
    )
    .reduce((total, membership) => total + membership.seatsTaken, 0);

  return {
    availableSeats: pool.availableSeats,
    seatsTaken,
    occupiedSeats: pool.maxSeats - pool.availableSeats,
    status: pool.status,
  };
}

describe("cancelling before a driver has matched you", () => {
  it("cancels a REQUESTED ride without touching any pool", async () => {
    const ride = await bookRide(
      cast.nusrat.id,
      cast.zones.banani,
      cast.zones.mohakhali,
    );

    await cancelRideRequest(ride.id, cast.nusrat.id);

    const after = await prisma.rideRequest.findUniqueOrThrow({
      where: { id: ride.id },
    });
    expect(after.status).toBe("CANCELLED");
    expect(after.cancelledAt).not.toBeNull();
    expect(after.poolId).toBeNull();
    expect(await prisma.pool.count()).toBe(0);
  });

  it("records a CANCELLED row in the ride's history", async () => {
    const ride = await bookRide(
      cast.nusrat.id,
      cast.zones.banani,
      cast.zones.mohakhali,
    );

    await cancelRideRequest(ride.id, cast.nusrat.id);

    const history = await prisma.rideStatusHistory.findMany({
      where: { rideRequestId: ride.id },
      orderBy: { createdAt: "asc" },
    });

    expect(history.map((row) => row.status)).toEqual(["REQUESTED", "CANCELLED"]);
    expect(history[1].changedById).toBe(cast.nusrat.id);
  });

  it("refuses a second cancellation", async () => {
    const ride = await bookRide(
      cast.nusrat.id,
      cast.zones.banani,
      cast.zones.mohakhali,
    );

    await cancelRideRequest(ride.id, cast.nusrat.id);

    await expectAppError(
      cancelRideRequest(ride.id, cast.nusrat.id),
      409,
    );
  });

  it("frees the passenger to book again", async () => {
    const first = await bookRide(
      cast.nusrat.id,
      cast.zones.banani,
      cast.zones.mohakhali,
    );

    // The one-active-request rule holds while it is open...
    await expectAppError(
      bookRide(cast.nusrat.id, cast.zones.banani, cast.zones.gulshan1),
      409,
      "You already have an active ride request",
    );

    await cancelRideRequest(first.id, cast.nusrat.id);

    // ...and lifts once it is cancelled.
    const second = await bookRide(
      cast.nusrat.id,
      cast.zones.banani,
      cast.zones.gulshan1,
    );
    expect(second.status).toBe("REQUESTED");
  });
});

describe("cancelling after being matched", () => {
  it("returns the seat to the pool", async () => {
    const { poolId, rafiqId } = await twoInBullet();

    expect((await seatsOf(poolId)).availableSeats).toBe(1);

    await cancelRideRequest(rafiqId, cast.rafiq.id);

    const after = await seatsOf(poolId);
    expect(after.availableSeats).toBe(2);
    expect(after.seatsTaken).toBe(1);
    expect(after.status).toBe("OPEN");

    // The freed seat is genuinely usable: a third passenger can take it.
    const shirin = await bookRide(
      cast.shirin.id,
      cast.zones.banani,
      cast.zones.mohakhali,
    );
    await acceptRideRequest(cast.jashim.id, shirin.id);

    const refilled = await seatsOf(poolId);
    expect(refilled.seatsTaken).toBe(2);
    expect(refilled.availableSeats).toBe(1);
  });

  it("releases more than one seat when the passenger booked more than one", async () => {
    const ride = await bookRide(
      cast.nusrat.id,
      cast.zones.banani,
      cast.zones.mohakhali,
      2,
    );
    const { pool } = await acceptRideRequest(
      cast.jashim.id,
      ride.id,
      cast.bullet.id,
    );

    expect(pool.availableSeats).toBe(1);

    await cancelRideRequest(ride.id, cast.nusrat.id);

    const after = await seatsOf(pool.id);
    expect(after.availableSeats).toBe(3);
    expect(after.seatsTaken).toBe(0);
  });

  it("still allows a cancel while the driver is waiting at the pickup", async () => {
    const { poolId, rafiqId } = await twoInBullet();
    await markArrived(poolId, cast.jashim.id);

    await cancelRideRequest(rafiqId, cast.rafiq.id);

    const after = await seatsOf(poolId);
    expect(after.availableSeats).toBe(2);
    expect(after.status).toBe("DRIVER_ARRIVED");
  });

  it("cancels the pool itself when the last passenger leaves", async () => {
    const { poolId, nusratId, rafiqId } = await twoInBullet();

    // One passenger leaves first: Rafiq's seat comes back and the trip
    // carries on, because Nusrat is still aboard.
    await cancelRideRequest(rafiqId, cast.rafiq.id);
    expect((await seatsOf(poolId)).status).toBe("OPEN");

    // Now the last one goes. With nobody aboard, the driver's
    // one-active-trip slot must not stay stuck on an empty trip.
    await cancelRideRequest(nusratId, cast.nusrat.id);

    const after = await seatsOf(poolId);
    expect(after.status).toBe("CANCELLED");
    expect(after.seatsTaken).toBe(0);
    expect(after.availableSeats).toBe(3);

    const history = await prisma.rideStatusHistory.findMany({
      where: { poolId },
      orderBy: { createdAt: "asc" },
    });
    expect(
      history.some((row) => row.note?.includes("auto-cancelled")),
      "the auto-cancel should be recorded in the trip timeline",
    ).toBe(true);
  });
});

describe("cancelling once the trip has started", () => {
  it("refuses a passenger cancel after STARTED", async () => {
    const { poolId, rafiqId } = await twoInBullet();
    await markArrived(poolId, cast.jashim.id);
    await startTrip(poolId, cast.jashim.id);

    await expectAppError(
      cancelRideRequest(rafiqId, cast.rafiq.id),
      409,
      "already started",
    );

    // The passenger is still counted as aboard, and the seat is still taken.
    const after = await seatsOf(poolId);
    expect(after.seatsTaken).toBe(2);
    expect(after.availableSeats).toBe(1);

    const ride = await prisma.rideRequest.findUniqueOrThrow({
      where: { id: rafiqId },
    });
    expect(ride.status).toBe("STARTED");
  });

  it("refuses a driver cancel after STARTED", async () => {
    const { poolId } = await twoInBullet();
    await markArrived(poolId, cast.jashim.id);
    await startTrip(poolId, cast.jashim.id);

    await expectAppError(cancelTrip(poolId, cast.jashim.id), 409);

    const after = await seatsOf(poolId);
    expect(after.status).toBe("STARTED");
  });

  it("allows a driver cancel before the trip starts", async () => {
    const { poolId, nusratId, rafiqId } = await twoInBullet();

    await cancelTrip(poolId, cast.jashim.id, "vehicle trouble");

    const after = await seatsOf(poolId);
    expect(after.status).toBe("CANCELLED");

    // Everyone still aboard is cancelled with it.
    const rides = await prisma.rideRequest.findMany({
      where: { id: { in: [nusratId, rafiqId] } },
    });
    expect(rides.every((ride) => ride.status === "CANCELLED")).toBe(true);
  });

  it("frees the driver to start a fresh trip after cancelling", async () => {
    const { poolId } = await twoInBullet();
    await cancelTrip(poolId, cast.jashim.id);

    const ride = await bookRide(
      cast.nusrat.id,
      cast.zones.banani,
      cast.zones.mohakhali,
    );

    const { pool: freshPool } = await acceptRideRequest(
      cast.jashim.id,
      ride.id,
      cast.bullet.id,
    );

    expect(freshPool.id).not.toBe(poolId);
    expect((await seatsOf(freshPool.id)).status).toBe("OPEN");
  });
});
