import { z } from "zod";

// Shared by POST /api/vehicles AND the DRIVER branch of signup, so a driver's
// first Tesla and any later ones go through identical rules.
export const createVehicleSchema = z.object({
  name: z.string().trim().min(1, "Vehicle name is required"), // e.g. "Bullet"
  model: z.string().trim().min(1, "Vehicle model is required"),
  plateNumber: z.string().trim().min(1, "Plate number is required"),
  seatCapacity: z.coerce
    .number()
    .int()
    .min(1, "Seat capacity must be at least 1")
    .max(6, "Seat capacity looks unrealistic for a rickshaw/Tesla"),
});

export type CreateVehicleInput = z.infer<typeof createVehicleSchema>;

export const updateVehicleSchema = createVehicleSchema.partial().extend({
  isActive: z.boolean().optional(),
});

export type UpdateVehicleInput = z.infer<typeof updateVehicleSchema>;
