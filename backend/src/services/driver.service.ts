import { prisma } from "../lib/prisma.js";
import { AppError } from "../utils/AppError.js";
import { toSafeUser } from "../utils/safeUser.js";
import { ACTIVE_POOL_STATUSES } from "./poolShared.js";

/**
 * PRD driver column: "go online/offline". Online = eligible to accept ride
 * requests. A driver with a trip in progress can't go offline — that would
 * strand passengers who are already matched.
 */
export async function setOnlineStatus(driverId: string, isOnline: boolean) {
  if (!isOnline) {
    const activePool = await prisma.pool.findFirst({
      where: { driverId, status: { in: ACTIVE_POOL_STATUSES } },
      select: { id: true },
    });

    if (activePool) {
      throw new AppError(
        "You can't go offline while you have an active trip — complete or cancel it first",
        409
      );
    }
  }

  const user = await prisma.user.update({
    where: { id: driverId },
    data: { isOnline },
  });

  return toSafeUser(user);
}
