import { prisma } from "../../src/lib/prisma.js";

/**
 * Wipes every table so each test starts from a known-empty database.
 *
 * TRUNCATE ... CASCADE removes dependent rows for us and RESTART IDENTITY
 * keeps sequences moving, so no test can be affected by a previous one. The
 * table order is irrelevant because of CASCADE, but it is written the way a
 * reader would expect: children first.
 */
export async function resetDatabase() {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      ride_status_history,
      payments,
      pool_memberships,
      ride_requests,
      pools,
      vehicles,
      zones,
      users
    RESTART IDENTITY CASCADE
  `);
}
