import { z } from "zod";

// BD mobile numbers: 11 digits, starting 01[3-9] — matches the seed data
// (01700000001 etc.) 
const phoneSchema = z
  .string()
  .trim()
  .regex(/^01[3-9]\d{8}$/, "Enter a valid Bangladeshi phone number, e.g. 01712345678");

export const signupSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters"),
  phone: phoneSchema,
  email: z.string().trim().email("Enter a valid email").optional(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  role: z.enum(["PASSENGER", "DRIVER"]).default("PASSENGER"),
});

export type SignupInput = z.infer<typeof signupSchema>;

export const loginSchema = z.object({
  phone: phoneSchema,
  password: z.string().min(1, "Password is required"),
});

export type LoginInput = z.infer<typeof loginSchema>;