import type { NextFunction, Request, Response } from "express";
import { Prisma } from "../../generated/prisma/client.js";
import { AppError } from "../utils/AppError.js";
import { env } from "../config/env.js";

/**
 * Catches any request that fell through every mounted router.
 * Must be registered AFTER all routes, BEFORE errorHandler.
 */
export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(new AppError(`Route not found: ${req.method} ${req.originalUrl}`, 404));
}

/**
 * Single place all errors funnel through — thrown AppErrors, Prisma errors,
 * and unexpected bugs alike. Express 5 auto-forwards rejected promises from
 * async route handlers here, so route code can just `throw new AppError(...)`.
 * Must be registered LAST, after every other app.use()/route.
 */
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
): void {
  let statusCode = 500;
  let message = "Internal server error";
  let details: unknown;

  if (err instanceof AppError) {
    statusCode = err.statusCode;
    message = err.message;
    details = err.details;
  } else if (err instanceof Prisma.PrismaClientKnownRequestError) {
    statusCode = mapPrismaErrorToStatus(err.code);
    message = mapPrismaErrorToMessage(err);
  } else if (err instanceof Prisma.PrismaClientValidationError) {
    statusCode = 400;
    message = "Invalid data sent to the database";
  } else if (err instanceof Error && env.NODE_ENV === "development") {
    message = err.message;
  }

  if (statusCode >= 500) {
    console.error(`💥 [${req.method} ${req.originalUrl}]`, err);
  } else {
    console.warn(`⚠️  [${req.method} ${req.originalUrl}] ${statusCode} - ${message}`);
  }

  res.status(statusCode).json({
    success: false,
    error: {
      message,
      ...(details !== undefined ? { details } : {}),
      ...(env.NODE_ENV === "development" && err instanceof Error
        ? { stack: err.stack }
        : {}),
    },
  });
}

function mapPrismaErrorToStatus(code: string): number {
  switch (code) {
    case "P2002": // unique constraint violation
      return 409;
    case "P2025": // record to update/delete not found
      return 404;
    case "P2003": // foreign key constraint failed
      return 400;
    default:
      return 400;
  }
}

function mapPrismaErrorToMessage(err: Prisma.PrismaClientKnownRequestError): string {
  switch (err.code) {
    case "P2002": {
      const target = (err.meta?.["target"] as string[] | undefined)?.join(", ");
      return `A record with this ${target ?? "value"} already exists`;
    }
    case "P2025":
      return "Record not found";
    case "P2003":
      return "Related record not found (foreign key constraint failed)";
    default:
      return "Database request failed";
  }
}