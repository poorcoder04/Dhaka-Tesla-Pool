import type { NextFunction, Request, Response } from "express";
import type { ZodType } from "zod";
import { AppError } from "../utils/AppError.js";

/**
 * Validates req.body against a zod schema, replacing req.body with the
 * parsed (and coerced/defaulted) result on success. On failure, forwards a
 * 400 AppError with per-field messages so the client can show them inline.
 */
export function validate(schema: ZodType) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      next(new AppError("Validation failed", 400, result.error.flatten().fieldErrors));
      return;
    }

    req.body = result.data;
    next();
  };
}