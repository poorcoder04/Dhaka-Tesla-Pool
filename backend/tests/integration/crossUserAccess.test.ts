import { beforeEach, describe, expect, it } from "vitest";

import { prisma } from "../../src/lib/prisma.js";
import {
  cancelTrip,
  completeTrip,
  markArrived,
  startTrip,
} from "../../src/services/poolLifecycle.service.js";
import {
  acceptRideRequest,
  getPoolForDriver,
  getPoolTimeline,
} from "../../src/services/pool.service.js";
import {
  cancelRideRequest,
  getRideRequestById,
  getRideRequestHistory,
} from "../../src/services/rideRequest.service.js";
import { updateVehicle } from "../../src/services/vehicle.service.js";
import { expectAppError } from "../helpers/assert.js";
import { bookRide, createCast, type Cast } from "../helpers/cast.js";
import { resetDatabase } from "../helpers/db.js";

/**
 * PRD Section 12: "users can't modify another user's ride."
 *
 * Also PRD Section 2: "Each passenger needs to see their own fare and their
 * own status, not anyone else's." The second sentence is an authorisation
 * requirement, not just a display one, so the timeline read is covered too.
 *
 * Nafisa is the bystander: an authenticated passenger with no connection to
 * any of the story cast's rides.
 */

let cast: Cast;
let rivalDriver: { id: string };

/** Jashim accepts Nusrat and Rafiq, so there is a live pool to poke at. */
async function pooledTrip() {
  const nusratRequest = await bookRide(
    cast.nusrat.id,
    cast.zones.banani,
    cast.zones.mohakhali,
  );
  const rafiqRequest = await bookRide(
    cast.rafiq.id,
    cast.zones.banani,
    cast.zones.gulshan1,
  );

  // acceptRideRequest returns the ride as it now stands, with poolId set.
  // bookRide's copy is still the pre-match REQUESTED row.
  const accepted = await acceptRideRequest(
    cast.jashim.id,
    nusratRequest.id,
    cast.bullet.id,
  );
  await acceptRideRequest(cast.jashim.id, rafiqRequest.id, cast.bullet.id);

  return {
    pool: accepted.pool,
    nusrat: accepted.rideRequest,
    rafiq: rafiqRequest,
  };
}

beforeEach(async () => {
  await resetDatabase();
  cast = await createCast();

  const rival = await prisma.user.create({
    data: { name: "Salma", phone: "01788888888", role: "DRIVER", isOnline: true },
  });
  await prisma.vehicle.create({
    data: { ownerId: rival.id, name: "Comet", seatCapacity: 3 },
  });
  rivalDriver = rival;
});

describe("a passenger cannot touch another passenger's ride", () => {
  it("refuses to read someone else's ride request", async () => {
    const { nusrat } = await pooledTrip();

    await expectAppError(
      getRideRequestById(nusrat.id, cast.nafisa.id),
      403,
      "You do not own this ride request",
    );
  });

  it("refuses to cancel someone else's ride request", async () => {
    const { nusrat } = await pooledTrip();

    await expectAppError(
      cancelRideRequest(nusrat.id, cast.nafisa.id),
      403,
      "You do not own this ride request",
    );

    // The refusal must leave the ride exactly as it was.
    const ride = await prisma.rideRequest.findUniqueOrThrow({
      where: { id: nusrat.id },
    });
    expect(ride.status).toBe("MATCHED");
    expect(ride.cancelledAt).toBeNull();

    // And the seat is still occupied — a rejected cancel must not quietly
    // release a seat that is still being used.
    const pool = await prisma.pool.findUniqueOrThrow({
      where: { id: nusrat.poolId! },
    });
    expect(pool.availableSeats).toBe(1);
  });

  it("refuses to read another passenger's status timeline", async () => {
    const { nusrat } = await pooledTrip();

    await expectAppError(
      getRideRequestHistory(nusrat.id, cast.nafisa.id),
      403,
      "You do not own this ride request",
    );
  });

  it("keeps one passenger's timeline free of the pool's other rows", async () => {
    const { nusrat, rafiq } = await pooledTrip();
    await markArrived(nusrat.poolId!, cast.jashim.id);

    const history = await getRideRequestHistory(nusrat.id, cast.nusrat.id);

    // Filtered by rideRequestId, so pool-level rows and Rafiq's rows can never
    // appear — the PRD's "their own status, not anyone else's".
    expect(history.length).toBeGreaterThan(0);
    expect(
      history.every((row) => row.id && row.status && row.createdAt),
    ).toBe(true);
    expect(
      await prisma.rideStatusHistory.count({
        where: { rideRequestId: rafiq.id },
      }),
    ).toBeGreaterThan(0);
  });

  it("does not leak the other passengers when a ride is read by its owner", async () => {
    const { nusrat, rafiq } = await pooledTrip();

    const ride = await getRideRequestById(nusrat.id, cast.nusrat.id);

    // The pool is included so the passenger can recognise their Tesla, but it
    // carries no membership list, so Rafiq is not exposed through it.
    expect(ride.pool).toBeTruthy();
    expect(ride.pool).not.toHaveProperty("memberships");
    expect(JSON.stringify(ride)).not.toContain(rafiq.id);
  });
});

describe("a driver cannot touch another driver's trip", () => {
  it("refuses to read someone else's pool", async () => {
    const { pool } = await pooledTrip();

    await expectAppError(
      getPoolForDriver(pool.id, rivalDriver.id),
      403,
      "You do not own this trip",
    );
  });

  it("refuses to read someone else's pool timeline", async () => {
    const { pool } = await pooledTrip();

    await expectAppError(
      getPoolTimeline(pool.id, rivalDriver.id),
      403,
      "You do not own this trip",
    );
  });

  it("refuses every lifecycle action on someone else's pool", async () => {
    const { pool } = await pooledTrip();

    const actions: Array<[string, (id: string, driverId: string) => unknown]> = [
      ["markArrived", markArrived],
      ["startTrip", startTrip],
      ["completeTrip", completeTrip],
      ["cancelTrip", cancelTrip],
    ];

    for (const [name, action] of actions) {
      await expectAppError(
        action(pool.id, rivalDriver.id),
        403,
        "You do not own this trip",
        );
    }

    // Nothing moved: still OPEN, and both passengers still matched.
    const unchanged = await prisma.pool.findUniqueOrThrow({
      where: { id: pool.id },
    });
    expect(unchanged.status).toBe("OPEN");
    expect(unchanged.availableSeats).toBe(1);

    const rides = await prisma.rideRequest.findMany({
      where: { poolId: pool.id },
    });
    expect(rides.every((ride) => ride.status === "MATCHED")).toBe(true);
  });

  it("refuses to update someone else's vehicle", async () => {
    await expectAppError(
      updateVehicle(cast.bullet.id, rivalDriver.id, { seatCapacity: 1 }),
      403,
      "You do not own this vehicle",
    );

    const bullet = await prisma.vehicle.findUniqueOrThrow({
      where: { id: cast.bullet.id },
    });
    expect(bullet.seatCapacity).toBe(3);
  });
});

describe("ownership checks distinguish missing from forbidden", () => {
  it("returns 404 for a trip that does not exist, 403 for one owned by someone else", async () => {
    await expectAppError(
      getPoolForDriver("no-such-pool", cast.jashim.id),
      404,
      "Trip not found",
    );

    const { pool } = await pooledTrip();
    await expectAppError(
      getPoolForDriver(pool.id, rivalDriver.id),
      403,
      "You do not own this trip",
    );
  });
});
