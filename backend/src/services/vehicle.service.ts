import { prisma } from "../lib/prisma.js";
import { AppError } from "../utils/AppError.js";
import type { CreateVehicleInput, UpdateVehicleInput } from "../validators/vehicle.validator.js";

/**
 * Registers an additional vehicle for an existing driver. A driver's FIRST
 * vehicle is normally created during signup() — this is
 * for adding a 2nd/3rd Tesla later.
 */
export async function createVehicle(ownerId: string, input: CreateVehicleInput) {
  return prisma.vehicle.create({
    data: {
      ownerId,
      name: input.name,
      model: input.model,
      plateNumber: input.plateNumber,
      seatCapacity: input.seatCapacity,
    },
  });
}

export async function listMyVehicles(ownerId: string) {
  return prisma.vehicle.findMany({
    where: { ownerId },
    orderBy: { createdAt: "desc" },
  });
}

export async function getVehicleById(id: string) {
  const vehicle = await prisma.vehicle.findUnique({ where: { id } });

  if (!vehicle) {
    throw new AppError("Vehicle not found", 404);
  }

  return vehicle;
}

export async function updateVehicle(id: string, ownerId: string, input: UpdateVehicleInput) {
  const vehicle = await prisma.vehicle.findUnique({ where: { id } });

  if (!vehicle) {
    throw new AppError("Vehicle not found", 404);
  }

  if (vehicle.ownerId !== ownerId) {
    throw new AppError("You do not own this vehicle", 403);
  }

  return prisma.vehicle.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.model !== undefined ? { model: input.model } : {}),
      ...(input.plateNumber !== undefined
        ? { plateNumber: input.plateNumber }
        : {}),
      ...(input.seatCapacity !== undefined
        ? { seatCapacity: input.seatCapacity }
        : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    },
  });
}