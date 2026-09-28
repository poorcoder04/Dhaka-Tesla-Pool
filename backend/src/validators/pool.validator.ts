import { z } from "zod";

// vehicleId is only required when the driver has no active pool yet (i.e.
// this accept will START a new trip). If the driver already has an OPEN
// pool, vehicleId is ignored by the service — the existing pool's vehicle
// is reused. Kept optional here; the service enforces the "required when
// starting a new trip" rule since that depends on runtime state, not just
// the shape of the body.
export const acceptRideRequestSchema = z.object({
  vehicleId: z.string().trim().min(1).optional(),
});

export type AcceptRideRequestInput = z.infer<typeof acceptRideRequestSchema>;