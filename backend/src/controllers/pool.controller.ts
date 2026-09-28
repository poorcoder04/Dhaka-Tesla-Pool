import type { Request, Response } from "express";
import * as poolService from "../services/pool.service.js";
import * as lifecycle from "../services/poolLifecycle.service.js";
import { AppError } from "../utils/AppError.js";

function requireUserId(req: Request): string {
  if (!req.user) throw new AppError("Authentication required", 401);
  return req.user.id;
}

export async function getActive(req: Request, res: Response): Promise<void> {
  const pool = await poolService.getActivePoolForDriver(requireUserId(req));
  res.status(200).json({ success: true, data: pool });
}

export async function getOne(req: Request, res: Response): Promise<void> {
  const pool = await poolService.getPoolForDriver(
    req.params.id as string,
    requireUserId(req),
  );
  res.status(200).json({ success: true, data: pool });
}

export async function listHistory(req: Request, res: Response): Promise<void> {
  const pools = await poolService.listPoolHistoryForDriver(requireUserId(req));
  res.status(200).json({ success: true, data: pools });
}

export async function getTimeline(req: Request, res: Response): Promise<void> {
  const timeline = await poolService.getPoolTimeline(
    req.params.id as string,
    requireUserId(req),
  );
  res.status(200).json({ success: true, data: timeline });
}

export async function arrive(req: Request, res: Response): Promise<void> {
  const pool = await lifecycle.markArrived(
    req.params.id as string,
    requireUserId(req),
  );
  res.status(200).json({ success: true, data: pool });
}

export async function start(req: Request, res: Response): Promise<void> {
  const pool = await lifecycle.startTrip(
    req.params.id as string,
    requireUserId(req),
  );
  res.status(200).json({ success: true, data: pool });
}

export async function complete(req: Request, res: Response): Promise<void> {
  const pool = await lifecycle.completeTrip(
    req.params.id as string,
    requireUserId(req),
  );
  res.status(200).json({ success: true, data: pool });
}

export async function cancel(req: Request, res: Response): Promise<void> {
  const { reason } = req.body as { reason?: string };
  const pool = await lifecycle.cancelTrip(
    req.params.id as string,
    requireUserId(req),
    reason,
  );
  res.status(200).json({ success: true, data: pool });
}
