import { describe, expect, it } from "vitest";
import { PoolStatus, RideStatus } from "../generated/prisma/client.js";
import {
  POOL_TRANSITIONS,
  RIDE_TRANSITIONS,
  assertPoolTransition,
  assertRideTransition,
  canTransitionPool,
  canTransitionRide,
} from "../src/config/statusTransitions.js";
import { AppError } from "../src/utils/AppError.js";

describe("pool transitions", () => {
  it("allows the happy path OPEN -> DRIVER_ARRIVED -> STARTED -> COMPLETED", () => {
    expect(canTransitionPool(PoolStatus.OPEN, PoolStatus.DRIVER_ARRIVED)).toBe(
      true,
    );
    expect(
      canTransitionPool(PoolStatus.DRIVER_ARRIVED, PoolStatus.STARTED),
    ).toBe(true);
    expect(canTransitionPool(PoolStatus.STARTED, PoolStatus.COMPLETED)).toBe(
      true,
    );
  });

  it("rejects skipping a stage", () => {
    expect(canTransitionPool(PoolStatus.OPEN, PoolStatus.STARTED)).toBe(false);
    expect(canTransitionPool(PoolStatus.OPEN, PoolStatus.COMPLETED)).toBe(
      false,
    );
    expect(
      canTransitionPool(PoolStatus.DRIVER_ARRIVED, PoolStatus.COMPLETED),
    ).toBe(false);
  });

  it("rejects going backwards", () => {
    expect(
      canTransitionPool(PoolStatus.STARTED, PoolStatus.DRIVER_ARRIVED),
    ).toBe(false);
    expect(canTransitionPool(PoolStatus.DRIVER_ARRIVED, PoolStatus.OPEN)).toBe(
      false,
    );
  });

  it("lets a driver cancel before the trip starts, but not once STARTED", () => {
    expect(canTransitionPool(PoolStatus.OPEN, PoolStatus.CANCELLED)).toBe(true);
    expect(
      canTransitionPool(PoolStatus.DRIVER_ARRIVED, PoolStatus.CANCELLED),
    ).toBe(true);
    expect(canTransitionPool(PoolStatus.STARTED, PoolStatus.CANCELLED)).toBe(
      false,
    );
  });

  it("treats COMPLETED and CANCELLED as terminal", () => {
    expect(POOL_TRANSITIONS[PoolStatus.COMPLETED]).toEqual([]);
    expect(POOL_TRANSITIONS[PoolStatus.CANCELLED]).toEqual([]);
  });

  it("never lets any state move into the unused pool MATCHED status", () => {
    for (const targets of Object.values(POOL_TRANSITIONS)) {
      expect(targets).not.toContain(PoolStatus.MATCHED);
    }
  });

  it("throws a 409 AppError for an invalid change", () => {
    expect.assertions(3);
    try {
      assertPoolTransition(PoolStatus.OPEN, PoolStatus.COMPLETED);
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).statusCode).toBe(409);
      expect((err as AppError).message).toContain("OPEN → COMPLETED");
    }
  });

  it("does not throw for a valid change", () => {
    expect(() =>
      assertPoolTransition(PoolStatus.OPEN, PoolStatus.DRIVER_ARRIVED),
    ).not.toThrow();
  });
});

describe("ride transitions", () => {
  it("allows the full passenger path", () => {
    expect(canTransitionRide(RideStatus.REQUESTED, RideStatus.MATCHED)).toBe(
      true,
    );
    expect(
      canTransitionRide(RideStatus.MATCHED, RideStatus.DRIVER_ARRIVED),
    ).toBe(true);
    expect(
      canTransitionRide(RideStatus.DRIVER_ARRIVED, RideStatus.STARTED),
    ).toBe(true);
    expect(canTransitionRide(RideStatus.STARTED, RideStatus.COMPLETED)).toBe(
      true,
    );
  });

  it("cancellation is valid before STARTED and never after", () => {
    expect(canTransitionRide(RideStatus.REQUESTED, RideStatus.CANCELLED)).toBe(
      true,
    );
    expect(canTransitionRide(RideStatus.MATCHED, RideStatus.CANCELLED)).toBe(
      true,
    );
    expect(
      canTransitionRide(RideStatus.DRIVER_ARRIVED, RideStatus.CANCELLED),
    ).toBe(true);
    expect(canTransitionRide(RideStatus.STARTED, RideStatus.CANCELLED)).toBe(
      false,
    );
    expect(canTransitionRide(RideStatus.COMPLETED, RideStatus.CANCELLED)).toBe(
      false,
    );
  });

  it("cannot skip matching or leave a terminal state", () => {
    expect(canTransitionRide(RideStatus.REQUESTED, RideStatus.STARTED)).toBe(
      false,
    );
    expect(canTransitionRide(RideStatus.REQUESTED, RideStatus.COMPLETED)).toBe(
      false,
    );
    expect(canTransitionRide(RideStatus.CANCELLED, RideStatus.REQUESTED)).toBe(
      false,
    );
    expect(RIDE_TRANSITIONS[RideStatus.COMPLETED]).toEqual([]);
  });

  it("throws a 409 AppError for an invalid change", () => {
    expect(() =>
      assertRideTransition(RideStatus.STARTED, RideStatus.CANCELLED),
    ).toThrow(AppError);
  });
});
