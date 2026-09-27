import { z } from "zod";

// A passenger requests at most 3 seats (matches Bullet's capacity — see
// PRD Section 3). No vehicle is assigned yet at request time (that happens
// during matching in Step 5), so this is a flat MVP-wide cap, not tied to
// any specific Vehicle.seatCapacity.
export const createRideRequestSchema = z
  .object({
    originZoneId: z.string().trim().min(1, "originZoneId is required"),
    destinationZoneId: z.string().trim().min(1, "destinationZoneId is required"),
    seatsRequested: z.coerce
      .number()
      .int()
      .min(1, "Must request at least 1 seat")
      .max(3, "A ride request can be for at most 3 seats")
      .default(1),
  })
  .refine((data) => data.originZoneId !== data.destinationZoneId, {
    message: "originZoneId and destinationZoneId must be different",
    path: ["destinationZoneId"],
  });

export type CreateRideRequestInput = z.infer<typeof createRideRequestSchema>;