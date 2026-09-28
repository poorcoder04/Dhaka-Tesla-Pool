import { PoolStatus, RideStatus } from "../../generated/prisma/client.js";
import { AppError } from "../utils/AppError.js";

/**
 * The single source of truth for what status changes are legal.
 * Every service that changes a pool or ride status goes through
 * assertPoolTransition / assertRideTransition, so the rules live in one
 * readable table instead of being scattered across if-statements.
 *
 * Pool lifecycle (driver-driven):
 *   OPEN -> DRIVER_ARRIVED -> STARTED -> COMPLETED
 *   OPEN | DRIVER_ARRIVED -> CANCELLED   (once STARTED the trip must finish)
 *
 * PoolStatus.MATCHED exists in the enum but is intentionally unreachable: a
 * pool is only ever created because a driver accepted a passenger, so it is
 * born "matched" and starts life as OPEN (open = has a driver, still
 * accepting passengers until the driver arrives at pickup).
 *
 * Ride (per-passenger) lifecycle:
 *   REQUESTED -> MATCHED -> DRIVER_ARRIVED -> STARTED -> COMPLETED
 *   REQUESTED | MATCHED | DRIVER_ARRIVED -> CANCELLED  (not after STARTED)
 */
export const POOL_TRANSITIONS: Readonly<Record<PoolStatus, readonly PoolStatus[]>> = {
  [PoolStatus.OPEN]: [PoolStatus.DRIVER_ARRIVED, PoolStatus.CANCELLED],
  [PoolStatus.MATCHED]: [],
  [PoolStatus.DRIVER_ARRIVED]: [PoolStatus.STARTED, PoolStatus.CANCELLED],
  [PoolStatus.STARTED]: [PoolStatus.COMPLETED],
  [PoolStatus.COMPLETED]: [],
  [PoolStatus.CANCELLED]: [],
};

export const RIDE_TRANSITIONS: Readonly<Record<RideStatus, readonly RideStatus[]>> = {
  [RideStatus.REQUESTED]: [RideStatus.MATCHED, RideStatus.CANCELLED],
  [RideStatus.MATCHED]: [RideStatus.DRIVER_ARRIVED, RideStatus.CANCELLED],
  [RideStatus.DRIVER_ARRIVED]: [RideStatus.STARTED, RideStatus.CANCELLED],
  [RideStatus.STARTED]: [RideStatus.COMPLETED],
  [RideStatus.COMPLETED]: [],
  [RideStatus.CANCELLED]: [],
};

export function canTransitionPool(from: PoolStatus, to: PoolStatus): boolean {
  return POOL_TRANSITIONS[from].includes(to);
}

export function canTransitionRide(from: RideStatus, to: RideStatus): boolean {
  return RIDE_TRANSITIONS[from].includes(to);
}

export function assertPoolTransition(from: PoolStatus, to: PoolStatus): void {
  if (!canTransitionPool(from, to)) {
    throw new AppError(`Invalid trip status change: ${from} → ${to}`, 409);
  }
}

export function assertRideTransition(from: RideStatus, to: RideStatus): void {
  if (!canTransitionRide(from, to)) {
    throw new AppError(`Invalid ride status change: ${from} → ${to}`, 409);
  }
}
