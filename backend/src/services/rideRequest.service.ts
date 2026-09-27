import { prisma } from "../lib/prisma.js";
import { AppError } from "../utils/AppError.js";
import { estimateFare } from "../utils/estimateFare.js";
import * as zoneService from "./zone.service.js";
import { RideStatus } from "../../generated/prisma/client.js";
import type { CreateRideRequestInput } from "../validators/rideRequest.validator.js";

// Requests still "in play" — a passenger may only have one of these open
// at a time (Step 4 decision: avoids duplicate/orphaned open requests at
// MVP scale). MATCHED is included even though matching itself is Step 5 —
// this guard is future-proofed for when that status starts being set.
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

  if (rideRequest.status !== RideStatus.REQUESTED) {
    throw new AppError(
      `Cannot cancel a ride request with status ${rideRequest.status}`,
      409
    );
  }

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
