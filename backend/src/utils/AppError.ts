/**
 * Operational error — represents a known, expected failure (bad input,
 * not found, forbidden, etc.) as opposed to a bug. The centralized error
 * handler uses `isOperational` to decide how much detail is safe to leak
 * to the client vs. what should only ever hit the server logs.
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly details?: unknown;

  constructor(message: string, statusCode = 500, details?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    this.details = details;

    Object.setPrototypeOf(this, AppError.prototype);
    Error.captureStackTrace(this, this.constructor);
  }
}