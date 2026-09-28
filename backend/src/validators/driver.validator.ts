import { z } from "zod";

export const setDriverStatusSchema = z.object({
  isOnline: z.boolean(),
});

export type SetDriverStatusInput = z.infer<typeof setDriverStatusSchema>;
