import { z } from "zod";

export const topupSchema = z.object({
  amount: z.number().positive("Topup amount must be positive"),
});

export const estimateFareSchema = z.object({
  originZoneId: z.string().min(1, "Origin zone is required"),
  destinationZoneId: z.string().min(1, "Destination zone is required"),
  seatsRequested: z.number().int().min(1).max(3).optional().default(1),
});
