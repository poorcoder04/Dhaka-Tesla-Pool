import { prisma } from "../lib/prisma.js";
import { AppError } from "../utils/AppError.js";
import { sameCluster } from "../config/zoneClusters.js";
import { PoolStatus, RideStatus } from "../../generated/prisma/client.js";

// A driver may only run one trip at a time (one Tesla, one route).
const ACTIVE_POOL_STATUSES: PoolStatus[] = [
  PoolStatus.OPEN,
  PoolStatus.MATCHED,
  PoolStatus.DRIVER_ARRIVED,
  PoolStatus.STARTED,
];

// Narrow local shapes — just the fields these helpers actually touch,
// rather than pulling in the full generated Prisma payload types.
interface RideRequestForMatching {
  id: string;
  passengerId: string;
  originZoneId: string;
  destinationZoneId: string;
  seatsRequested: number;
  originZone: { name: string };
  destinationZone: { name: string };
}

interface VehicleForMatching {
  id: string;
  seatCapacity: number;
}

const poolInclude = {
  vehicle: true,
  originZone: true,
  destinationZone: true,
  memberships: {
    include: { user: { select: { id: true, name: true, phone: true } } },
  },
} as const;

/**
 * The Step 5 matching engine. A driver accepts a specific ride request:
 *  - if they have no active pool, this request starts a brand new one
 *    (vehicleId required)
 *  - if they already have an OPEN pool, this request joins it IF the
 *    origin matches exactly and the destination is in the same cluster
 *    (see src/config/zoneClusters.ts — PRD Section 4's matching rule)
 */
export async function acceptRideRequest(
  driverId: string,
  rideRequestId: string,
  vehicleId: string | undefined
) {
  const rideRequest = await prisma.rideRequest.findUnique({
    where: { id: rideRequestId },
    include: { originZone: true, destinationZone: true },
  });

  if (!rideRequest) {
    throw new AppError("Ride request not found", 404);
  }

  if (rideRequest.status !== RideStatus.REQUESTED) {
    throw new AppError("This ride request is no longer available", 409);
  }

  const activePool = await prisma.pool.findFirst({
    where: { driverId, status: { in: ACTIVE_POOL_STATUSES } },
    include: { destinationZone: true },
  });

  if (activePool) {
    if (activePool.status !== PoolStatus.OPEN) {
      throw new AppError(
        "Your current trip is already underway — finish or cancel it before accepting a new passenger",
        409
      );
    }

    if (activePool.originZoneId !== rideRequest.originZoneId) {
      throw new AppError("This request's pickup zone doesn't match your current trip", 409);
    }

    if (!sameCluster(activePool.destinationZone.name, rideRequest.destinationZone.name)) {
      throw new AppError("This request's destination isn't compatible with your current trip", 409);
    }

    return joinExistingPool(activePool.id, rideRequest, driverId);
  }

  if (!vehicleId) {
    throw new AppError("vehicleId is required to start a new trip", 400);
  }

  const vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleId } });

  if (!vehicle) {
    throw new AppError("Vehicle not found", 404);
  }

  if (vehicle.ownerId !== driverId) {
    throw new AppError("You do not own this vehicle", 403);
  }

  if (!vehicle.isActive) {
    throw new AppError("This vehicle is not active", 409);
  }

  if (rideRequest.seatsRequested > vehicle.seatCapacity) {
    throw new AppError("Requested seats exceed this vehicle's capacity", 409);
  }

  return createPoolAndJoin(vehicle, rideRequest, driverId);
}

async function createPoolAndJoin(
  vehicle: VehicleForMatching,
  rideRequest: RideRequestForMatching,
  driverId: string
) {
  return prisma.$transaction(async (tx) => {
    const pool = await tx.pool.create({
      data: {
        driverId,
        vehicleId: vehicle.id,
        originZoneId: rideRequest.originZoneId,
        destinationZoneId: rideRequest.destinationZoneId,
        maxSeats: vehicle.seatCapacity,
        availableSeats: vehicle.seatCapacity - rideRequest.seatsRequested,
        status: PoolStatus.OPEN,
      },
    });

    await tx.poolMembership.create({
      data: {
        poolId: pool.id,
        rideRequestId: rideRequest.id,
        userId: rideRequest.passengerId,
        seatsTaken: rideRequest.seatsRequested,
      },
    });

    const updatedRideRequest = await tx.rideRequest.update({
      where: { id: rideRequest.id },
      data: { status: RideStatus.MATCHED, poolId: pool.id, matchedAt: new Date() },
      include: { originZone: true, destinationZone: true },
    });

    await tx.rideStatusHistory.create({
      data: {
        rideRequestId: rideRequest.id,
        poolId: pool.id,
        status: RideStatus.MATCHED,
        changedById: driverId,
        note: "Matched into a newly created pool",
      },
    });

    const fullPool = await tx.pool.findUniqueOrThrow({
      where: { id: pool.id },
      include: poolInclude,
    });

    return { rideRequest: updatedRideRequest, pool: fullPool };
  });
}

async function joinExistingPool(
  poolId: string,
  rideRequest: RideRequestForMatching,
  driverId: string
) {
  return prisma.$transaction(async (tx) => {
    // THE concurrency fix (PRD Section 12 — Nusrat vs. Shirin racing for
    // the last seat). This single conditional UPDATE is atomic at the row
    // level: two concurrent transactions both targeting the same pool row
    // cannot both succeed. Whichever commits first decrements
    // availableSeats; Postgres holds the row lock until that commit, so
    // the second transaction's WHERE clause is re-evaluated against the
    // ALREADY-DECREMENTED row once it acquires the lock — and matches 0
    // rows if there isn't enough left. No SELECT FOR UPDATE needed; the
    // conditional UPDATE ... WHERE does the same job in one round trip.
    const result = await tx.pool.updateMany({
      where: {
        id: poolId,
        status: PoolStatus.OPEN,
        availableSeats: { gte: rideRequest.seatsRequested },
      },
      data: { availableSeats: { decrement: rideRequest.seatsRequested } },
    });

    if (result.count === 0) {
      throw new AppError("Not enough seats left in this pool", 409);
    }

    await tx.poolMembership.create({
      data: {
        poolId,
        rideRequestId: rideRequest.id,
        userId: rideRequest.passengerId,
        seatsTaken: rideRequest.seatsRequested,
      },
    });

    const updatedRideRequest = await tx.rideRequest.update({
      where: { id: rideRequest.id },
      data: { status: RideStatus.MATCHED, poolId, matchedAt: new Date() },
      include: { originZone: true, destinationZone: true },
    });

    await tx.rideStatusHistory.create({
      data: {
        rideRequestId: rideRequest.id,
        poolId,
        status: RideStatus.MATCHED,
        changedById: driverId,
        note: "Matched into an existing pool",
      },
    });

    const fullPool = await tx.pool.findUniqueOrThrow({
      where: { id: poolId },
      include: poolInclude,
    });

    return { rideRequest: updatedRideRequest, pool: fullPool };
  });
}

/**
 * The driver's current in-progress trip (any status from OPEN through
 * STARTED), with its passengers and seat counts — the "See passengers/
 * seats" part of the PRD's driver column. Past/completed trips (driver
 * "ride history") are Step 6, once COMPLETED is a reachable status.
 */
export async function getActivePoolForDriver(driverId: string) {
  const pool = await prisma.pool.findFirst({
    where: { driverId, status: { in: ACTIVE_POOL_STATUSES } },
    include: poolInclude,
    orderBy: { createdAt: "desc" },
  });

  if (!pool) {
    throw new AppError("You have no active trip right now", 404);
  }

  return pool;
}
