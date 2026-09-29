import {
  PaymentMethod,
  PaymentStatus,
  PoolStatus,
  RideStatus,
} from "../../generated/prisma/client.js";
import {
  assertPoolTransition,
  assertRideTransition,
} from "../config/statusTransitions.js";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../utils/AppError.js";
import { calculateFare } from "../utils/estimateFare.js";
import { findOwnedPool } from "./pool.service.js";
import {
  LIVE_MEMBER_STATUSES,
  poolInclude,
  withSeatSummary,
} from "./poolShared.js";

interface TransitionSpec {
  to: PoolStatus;
  rideTo: RideStatus;
  poolNote: string;
  memberNote: string;
}

async function transitionPool(
  poolId: string,
  driverId: string,
  spec: TransitionSpec,
) {
  const pool = await findOwnedPool(poolId, driverId);
  assertPoolTransition(pool.status, spec.to);

  const now = new Date();

  await prisma.$transaction(async (tx) => {
    const updated = await tx.pool.updateMany({
      where: { id: poolId, status: pool.status },
      data: {
        status: spec.to,
        ...(spec.to === PoolStatus.STARTED ? { startedAt: now } : {}),
        ...(spec.to === PoolStatus.COMPLETED ? { completedAt: now } : {}),
        ...(spec.to === PoolStatus.CANCELLED ? { cancelledAt: now } : {}),
      },
    });

    if (updated.count === 0) {
      throw new AppError(
        "This trip's status just changed — refresh and try again",
        409,
      );
    }

    const members = await tx.rideRequest.findMany({
      where: { poolId, status: { in: LIVE_MEMBER_STATUSES } },
      select: {
        id: true,
        status: true,
        passengerId: true,
        seatsRequested: true,
        paymentMethod: true,
        originZone: { select: { name: true } },
        destinationZone: { select: { name: true } },
      },
    });

    if (members.length === 0) {
      throw new AppError("This trip has no active passengers", 409);
    }

    for (const member of members) {
      assertRideTransition(member.status, spec.rideTo);
    }

    await tx.rideRequest.updateMany({
      where: { id: { in: members.map((m) => m.id) } },
      data: {
        status: spec.rideTo,
        ...(spec.rideTo === RideStatus.CANCELLED ? { cancelledAt: now } : {}),
      },
    });

    await tx.rideStatusHistory.createMany({
      data: [
        {
          poolId,
          status: spec.rideTo,
          changedById: driverId,
          note: spec.poolNote,
        },
        ...members.map((m) => ({
          rideRequestId: m.id,
          poolId,
          status: spec.rideTo,
          changedById: driverId,
          note: spec.memberNote,
        })),
      ],
    });

    if (spec.to === PoolStatus.COMPLETED) {
      const totalPoolSeatsOccupied = members.reduce(
        (total, member) => total + member.seatsRequested,
        0,
      );

      for (const member of members) {
        const fare = calculateFare(
          member.originZone.name,
          member.destinationZone.name,
          member.seatsRequested,
          totalPoolSeatsOccupied,
        );

        let status: PaymentStatus = PaymentStatus.PENDING;
        let transactionId: string | null = null;
        let paidAt: Date | null = null;

        if (member.paymentMethod === PaymentMethod.WALLET) {
          const debit = await tx.user.updateMany({
            where: {
              id: member.passengerId,
              walletBalance: { gte: fare.finalFare },
            },
            data: { walletBalance: { decrement: fare.finalFare } },
          });

          if (debit.count === 1) {
            status = PaymentStatus.PAID;
            transactionId = `WLT-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
            paidAt = new Date();
          } else {
            status = PaymentStatus.FAILED;
          }
        }

        const fareBreakdown = JSON.parse(JSON.stringify(fare));
        await tx.payment.upsert({
          where: { rideRequestId: member.id },
          create: {
            rideRequestId: member.id,
            userId: member.passengerId,
            amount: fare.finalFare,
            baseFare: fare.baseFare,
            distanceCharge: fare.distanceCharge,
            poolDiscount: fare.poolDiscountAmount,
            fareBreakdown,
            method: member.paymentMethod,
            status,
            transactionId,
            paidAt,
          },
          update: {
            amount: fare.finalFare,
            baseFare: fare.baseFare,
            distanceCharge: fare.distanceCharge,
            poolDiscount: fare.poolDiscountAmount,
            fareBreakdown,
            status,
            transactionId,
            paidAt,
          },
        });
      }
    }
  });

  const fresh = await prisma.pool.findUniqueOrThrow({
    where: { id: poolId },
    include: poolInclude,
  });

  return withSeatSummary(fresh);
}

export function markArrived(poolId: string, driverId: string) {
  return transitionPool(poolId, driverId, {
    to: PoolStatus.DRIVER_ARRIVED,
    rideTo: RideStatus.DRIVER_ARRIVED,
    poolNote: "Driver arrived at pickup",
    memberNote: "Driver arrived at pickup",
  });
}

export function startTrip(poolId: string, driverId: string) {
  return transitionPool(poolId, driverId, {
    to: PoolStatus.STARTED,
    rideTo: RideStatus.STARTED,
    poolNote: "Trip started",
    memberNote: "Trip started",
  });
}

export function completeTrip(poolId: string, driverId: string) {
  return transitionPool(poolId, driverId, {
    to: PoolStatus.COMPLETED,
    rideTo: RideStatus.COMPLETED,
    poolNote: "Trip completed",
    memberNote: "Trip completed",
  });
}

export function cancelTrip(poolId: string, driverId: string, reason?: string) {
  const suffix = reason ? `: ${reason}` : "";

  return transitionPool(poolId, driverId, {
    to: PoolStatus.CANCELLED,
    rideTo: RideStatus.CANCELLED,
    poolNote: `Trip cancelled by driver${suffix}`,
    memberNote: `Cancelled because the driver cancelled the trip${suffix}`,
  });
}
