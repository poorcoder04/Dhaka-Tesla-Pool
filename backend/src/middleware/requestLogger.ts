import type { NextFunction, Request, Response } from "express";

/**
 * Minimal request logger. Logs on `finish` (not before the handler runs) so
 * the actual status code and duration are known. Kept dependency-free —
 * swap for pino/morgan later if structured logging is needed at scale.
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = process.hrtime.bigint();

  res.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;
    const { method, originalUrl } = req;
    const { statusCode } = res;
    const icon = statusCode >= 500 ? "🔥" : statusCode >= 400 ? "⚠️ " : "✅";
    console.log(`${icon} ${method} ${originalUrl} ${statusCode} - ${durationMs.toFixed(1)}ms`);
  });

  next();
}