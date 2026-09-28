import { prisma } from "../lib/prisma.js";
import { AppError } from "../utils/AppError.js";
import { estimateFare } from "../utils/estimateFare.js";
import * as zoneService from "./zone.service.js";
import { PoolStatus, RideStatus } from "../../generated/prisma/client.js";
import { canTransitionRide } from "../config/statusTransitions.js";
import { OPEN_RIDE_STATUSES } from "./poolShared.js";
import type { CreateRideRequestInput } from "../validators/rideRequest.validator.js";

// Requests still "in play" — a passenger may only have one of these open at
// a time (avoids duplicate/orphaned requests at MVP scale). Includes
// DRIVER_ARRIVED and STARTED: a passenger already standing at / riding in a
// Tesla must not be able to book a second ride.
const ACTIVE_STATUSES: RideStatus[] = OPEN_RIDE_STATUSES;

const rideRequestInclude = {
  originZone: true,
  destinationZone: true,
} as const;

export async function createRideRequest(passengerId: string, input: CreateRideRequestInput) {
  // Both zones must exist (and be active) — reuses the same lookup the
  // zones module already exposes rather than duplicating a findUnique here.
  const [originZone, destinationZone] = await Promise.all([
    zoneService.getZoneById(input.originZoneId),
    zoneService.getZoneById(input.destinationZoneId),
  ]);

  const existingActive = await prisma.rideRequest.findFirst({
    where: { passengerId, status: { in: ACTIVE_STATUSES } },
  });

  if (existingActive) {
    throw new AppError(
      "You already have an active ride request. Cancel it before requesting another.",
      409
    );
  }

  const rideRequest = await prisma.$transaction(async (tx) => {
    const created = await tx.rideRequest.create({
      data: {
        passengerId,
        originZoneId: originZone.id,
        destinationZoneId: destinationZone.id,
        seatsRequested: input.seatsRequested,
        status: RideStatus.REQUESTED,
      },
      include: rideRequestInclude,
    });

    await tx.rideStatusHistory.create({
      data: {
        rideRequestId: created.id,
        status: RideStatus.REQUESTED,
        changedById: passengerId,
        note: "Ride requested",
      },
    });

    return created;
  });

  return {
    ...rideRequest,
    estimatedFare: estimateFare(originZone.name, destinationZone.name),
  };
}

export async function listMyRideRequests(passengerId: string) {
  return prisma.rideRequest.findMany({
    where: { passengerId },
    include: rideRequestInclude,
    orderBy: { requestedAt: "desc" },
  });
}

// Driver-facing browse list — PRD Section 3, driver column: "See relevant
// requests". Deliberately unfiltered (all open requests, oldest first);
// the real compatibility check happens server-side at accept-time, so the
// browse list doesn't need to be smart about it.
export async function listOpenRideRequests() {
  return prisma.rideRequest.findMany({
    where: { status: RideStatus.REQUESTED },
    include: rideRequestInclude,
    orderBy: { requestedAt: "asc" },
  });
}

export async function getRideRequestById(id: string, passengerId: string) {
  const rideRequest = await prisma.rideRequest.findUnique({
    where: { id },
    include: {
      ...rideRequestInclude,
      // Enough for the passenger to recognise their Tesla — deliberately NOT
      // the other passengers in the pool (each passenger sees only their own).
      pool: {
        select: {
          id: true,
          status: true,
          driver: { select: { name: true } },
          vehicle: { select: { name: true, plateNumber: true } },
        },
      },
    },
  });

  if (!rideRequest) {
    throw new AppError("Ride request not found", 404);
  }

  if (rideRequest.passengerId !== passengerId) {
    throw new AppError("You do not own this ride request", 403);
  }

  return rideRequest;
}

/**
 * A passenger's own status timeline. Filtered by rideRequestId, so
 * pool-level rows and other passengers' rows can never appear here.
 */
export async function getRideRequestHistory(id: string, passengerId: string) {
  await getRideRequestById(id, passengerId); // 404 / 403 checks

  return prisma.rideStatusHistory.findMany({
    where: { rideRequestId: id },
    select: { id: true, status: true, note: true, createdAt: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
}

export async function cancelRideRequest(id: string, passengerId: string) {
  const rideRequest = await prisma.rideRequest.findUnique({ where: { id } });

  if (!rideRequest) {
    throw new AppError("Ride request not found", 404);
  }

  if (rideRequest.passengerId !== passengerId) {
    throw new AppError("You do not own this ride request", 403);
  }

  // The transition table decides what is cancellable (everything before
  // STARTED); the messages below just make the refusal readable.
  if (!canTransitionRide(rideRequest.status, RideStatus.CANCELLED)) {
    const reason =
      rideRequest.status === RideStatus.STARTED
        ? "Cannot cancel — your trip has already started"
        : `Cannot cancel a ride request with status ${rideRequest.status}`;
    throw new AppError(reason, 409);
  }

  if (rideRequest.status === RideStatus.REQUESTED) {
    return cancelUnmatched(id, passengerId);
  }

  return cancelFromPool(rideRequest, passengerId);
}

async function cancelUnmatched(id: string, passengerId: string) {
  return prisma.$transaction(async (tx) => {
    // Conditional: if a driver accepted this request a moment ago it is no
    // longer REQUESTED, and we must not silently overwrite MATCHED.
    const result = await tx.rideRequest.updateMany({
      where: { id, status: RideStatus.REQUESTED },
      data: { status: RideStatus.CANCELLED, cancelledAt: new Date() },
    });

    if (result.count === 0) {
      throw new AppError("This ride request just changed — refresh and try again", 409);
    }

    await tx.rideStatusHistory.create({
      data: {
        rideRequestId: id,
        status: RideStatus.CANCELLED,
        changedById: passengerId,
        note: "Cancelled by passenger",
      },
    });

    return tx.rideRequest.findUniqueOrThrow({ where: { id }, include: rideRequestInclude });
  });
}

// A passenger can cancel after being matched, right up until the trip
// STARTS (pool OPEN or DRIVER_ARRIVED — the latter covers a no-show/change
// of mind while the driver waits). The seat goes back to the pool. If that
// was the pool's last live passenger, the now-empty pool is auto-cancelled
// too — otherwise the driver's "one active pool at a time" slot would stay
// stuck on a trip with nobody in it.
//
// The status check lives INSIDE the transaction as a conditional update on
// the pool row (pool first, ride second — same lock order as the driver's
// lifecycle actions), so a driver hitting "start" at the same instant can
// never be raced past.
async function cancelFromPool(
  rideRequest: { id: string; poolId: string | null; seatsRequested: number },
  passengerId: string
) {
  const poolId = rideRequest.poolId;

  if (!poolId) {
    throw new AppError("This ride request has no associated pool", 500);
  }

  return prisma.$transaction(async (tx) => {
    const seatRelease = await tx.pool.updateMany({
      where: {
        id: poolId,
        status: { in: [PoolStatus.OPEN, PoolStatus.DRIVER_ARRIVED] },
      },
      data: { availableSeats: { increment: rideRequest.seatsRequested } },
    });

    if (seatRelease.count === 0) {
      throw new AppError("Cannot cancel — the driver's trip is already underway", 409);
    }

    const cancelled = await tx.rideRequest.updateMany({
      where: {
        id: rideRequest.id,
        status: { in: [RideStatus.MATCHED, RideStatus.DRIVER_ARRIVED] },
      },
      data: { status: RideStatus.CANCELLED, cancelledAt: new Date() },
    });

    if (cancelled.count === 0) {
      throw new AppError("This ride request just changed — refresh and try again", 409);
    }

    await tx.rideStatusHistory.create({
      data: {
        rideRequestId: rideRequest.id,
        poolId,
        status: RideStatus.CANCELLED,
        changedById: passengerId,
        note: "Cancelled by passenger; seat released back to pool",
      },
    });

    const remainingActiveMembers = await tx.rideRequest.count({
      where: {
        poolId,
        status: { in: [RideStatus.MATCHED, RideStatus.DRIVER_ARRIVED, RideStatus.STARTED] },
      },
    });

    if (remainingActiveMembers === 0) {
      await tx.pool.update({
        where: { id: poolId },
        data: { status: PoolStatus.CANCELLED, cancelledAt: new Date() },
      });

      await tx.rideStatusHistory.create({
        data: {
          poolId,
          status: RideStatus.CANCELLED,
          changedById: passengerId,
          note: "Trip auto-cancelled — last remaining passenger cancelled",
        },
      });
    }

    return tx.rideRequest.findUniqueOrThrow({
      where: { id: rideRequest.id },
      include: rideRequestInclude,
    });
  });
}
