import { PoolStatus, RideStatus } from "../../generated/prisma/client.js";

// A driver may only run one trip at a time (one Tesla, one route).
export const ACTIVE_POOL_STATUSES: PoolStatus[] = [
  PoolStatus.OPEN,
  PoolStatus.DRIVER_ARRIVED,
  PoolStatus.STARTED,
];

// Ride statuses of a passenger who is currently "in" a pool. Cancelled and
// completed passengers are no longer live members.
export const LIVE_MEMBER_STATUSES: RideStatus[] = [
  RideStatus.MATCHED,
  RideStatus.DRIVER_ARRIVED,
  RideStatus.STARTED,
];

// Statuses a passenger's ride request can be in while it still "counts"
// as their one open request.
export const OPEN_RIDE_STATUSES: RideStatus[] = [
  RideStatus.REQUESTED,
  RideStatus.MATCHED,
  RideStatus.DRIVER_ARRIVED,
  RideStatus.STARTED,
];

const membershipInclude = {
  user: { select: { id: true, name: true, phone: true } },
  // Each membership carries its passenger's own ride status, so a driver
  // (or a history view) can tell who is riding, who completed, who cancelled.
  rideRequest: {
    select: {
      id: true,
      status: true,
      seatsRequested: true,
      originZone: { select: { name: true } },
      destinationZone: { select: { name: true } },
    },
  },
} as const;

/** Full pool with every member ever attached (used by detail + history views). */
export const poolInclude = {
  vehicle: true,
  originZone: true,
  destinationZone: true,
  memberships: { include: membershipInclude },
} as const;

/** Pool showing only passengers who are still in the Tesla (active trip view). */
export const livePoolInclude = {
  vehicle: true,
  originZone: true,
  destinationZone: true,
  memberships: {
    where: { rideRequest: { status: { in: LIVE_MEMBER_STATUSES } } },
    include: membershipInclude,
  },
} as const;

/** Adds the "occupied seats" figure the PRD's driver column asks for. */
export function withSeatSummary<
  T extends { maxSeats: number; availableSeats: number },
>(pool: T) {
  return { ...pool, occupiedSeats: pool.maxSeats - pool.availableSeats };
}
