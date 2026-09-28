import { prisma } from "../lib/prisma.js";
import { AppError } from "../utils/AppError.js";
import { estimateFare } from "../utils/estimateFare.js";
import * as zoneService from "./zone.service.js";
import { PoolStatus, RideStatus } from "../../generated/prisma/client.js";
import type { CreateRideRequestInput } from "../validators/rideRequest.validator.js";

// Requests still "in play" — a passenger may only have one of these open
// at a time avoids duplicate/orphaned open requests at
// MVP scale).
const ACTIVE_STATUSES: RideStatus[] = [RideStatus.REQUESTED, RideStatus.MATCHED];

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
    include: rideRequestInclude,
  });

  if (!rideRequest) {
    throw new AppError("Ride request not found", 404);
  }

  if (rideRequest.passengerId !== passengerId) {
    throw new AppError("You do not own this ride request", 403);
  }

  return rideRequest;
}

export async function cancelRideRequest(id: string, passengerId: string) {
  const rideRequest = await prisma.rideRequest.findUnique({ where: { id } });

  if (!rideRequest) {
    throw new AppError("Ride request not found", 404);
  }

  if (rideRequest.passengerId !== passengerId) {
    throw new AppError("You do not own this ride request", 403);
  }

  if (rideRequest.status === RideStatus.REQUESTED) {
    return cancelUnmatched(id, passengerId);
  }

  if (rideRequest.status === RideStatus.MATCHED) {
    return cancelMatched(rideRequest, passengerId);
  }

  throw new AppError(`Cannot cancel a ride request with status ${rideRequest.status}`, 409);
}

async function cancelUnmatched(id: string, passengerId: string) {
  return prisma.$transaction(async (tx) => {
    const cancelled = await tx.rideRequest.update({
      where: { id },
      data: { status: RideStatus.CANCELLED, cancelledAt: new Date() },
      include: rideRequestInclude,
    });

    await tx.rideStatusHistory.create({
      data: {
        rideRequestId: id,
        status: RideStatus.CANCELLED,
        changedById: passengerId,
        note: "Cancelled by passenger",
      },
    });

    return cancelled;
  });
}

// New in Step 5: a passenger can still cancel after being matched, as long
// as the driver's trip hasn't actually started moving yet (pool still
// OPEN). The seat goes back to the pool. If that was the pool's last
// active member, the now-empty pool is auto-cancelled too — otherwise the
// driver's "one active pool at a time" slot would stay stuck on a trip
// with nobody left in it.
async function cancelMatched(
  rideRequest: { id: string; poolId: string | null; seatsRequested: number },
  passengerId: string
) {
  if (!rideRequest.poolId) {
    throw new AppError("This ride request has no associated pool", 500);
  }

  const pool = await prisma.pool.findUnique({ where: { id: rideRequest.poolId } });

  if (!pool) {
    throw new AppError("Associated pool not found", 500);
  }

  if (pool.status !== PoolStatus.OPEN) {
    throw new AppError("Cannot cancel — the driver's trip is already underway", 409);
  }

  return prisma.$transaction(async (tx) => {
    const cancelled = await tx.rideRequest.update({
      where: { id: rideRequest.id },
      data: { status: RideStatus.CANCELLED, cancelledAt: new Date() },
      include: rideRequestInclude,
    });

    await tx.pool.update({
      where: { id: pool.id },
      data: { availableSeats: { increment: rideRequest.seatsRequested } },
    });

    await tx.rideStatusHistory.create({
      data: {
        rideRequestId: rideRequest.id,
        poolId: pool.id,
        status: RideStatus.CANCELLED,
        changedById: passengerId,
        note: "Cancelled by passenger after matching; seat released back to pool",
      },
    });

    const remainingActiveMembers = await tx.rideRequest.count({
      where: {
        poolId: pool.id,
        status: { in: [RideStatus.MATCHED, RideStatus.DRIVER_ARRIVED, RideStatus.STARTED] },
      },
    });

    if (remainingActiveMembers === 0) {
      await tx.pool.update({
        where: { id: pool.id },
        data: { status: PoolStatus.CANCELLED, cancelledAt: new Date() },
      });

      await tx.rideStatusHistory.create({
        data: {
          poolId: pool.id,
          status: RideStatus.CANCELLED,
          changedById: passengerId,
          note: "Pool auto-cancelled — last remaining passenger cancelled",
        },
      });
    }

    return cancelled;
  });
}
