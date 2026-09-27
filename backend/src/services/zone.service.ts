import { prisma } from "../lib/prisma.js";
import { AppError } from "../utils/AppError.js";

// Zones are seed-only for the MVP (Section 4 of the PRD) — no create/update
// API. These are the read endpoints other modules (rides, pools) rely on to
// resolve a zone name to an id.
export async function listZones() {
  return prisma.zone.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
  });
}

export async function getZoneById(id: string) {
  const zone = await prisma.zone.findUnique({ where: { id } });

  if (!zone) {
    throw new AppError("Zone not found", 404);
  }

  return zone;
}
