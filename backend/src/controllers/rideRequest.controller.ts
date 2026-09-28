import type { Request, Response } from "express";
import * as poolService from "../services/pool.service.js";
import * as rideRequestService from "../services/rideRequest.service.js";
import { AppError } from "../utils/AppError.js";

export async function create(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new AppError("Authentication required", 401);

  const rideRequest = await rideRequestService.createRideRequest(
    req.user.id,
    req.body,
  );
  res.status(201).json({ success: true, data: rideRequest });
}

// passenger's own ride request history
export async function listMine(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new AppError("Authentication required", 401);

  const rideRequests = await rideRequestService.listMyRideRequests(req.user.id);
  res.status(200).json({ success: true, data: rideRequests });
}

// driver-facing browse list of currently open (unmatched) requests
export async function openList(_req: Request, res: Response): Promise<void> {
  const rideRequests = await rideRequestService.listOpenRideRequests();
  res.status(200).json({ success: true, data: rideRequests });
}

export async function getOne(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new AppError("Authentication required", 401);

  const rideRequest = await rideRequestService.getRideRequestById(
    req.params.id as string,
    req.user.id,
  );
  res.status(200).json({ success: true, data: rideRequest });
}

export async function getHistory(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new AppError("Authentication required", 401);

  const history = await rideRequestService.getRideRequestHistory(
    req.params.id as string,
    req.user.id,
  );
  res.status(200).json({ success: true, data: history });
}

export async function cancel(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new AppError("Authentication required", 401);

  const rideRequest = await rideRequestService.cancelRideRequest(
    req.params.id as string,
    req.user.id,
  );
  res.status(200).json({ success: true, data: rideRequest });
}

// driver accepts a ride request — starts or joins a pool (Step 5 matching)
export async function accept(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new AppError("Authentication required", 401);

  const { vehicleId } = req.body as { vehicleId?: string };
  const result = await poolService.acceptRideRequest(
    req.user.id,
    req.params.id as string,
    vehicleId,
  );
  res.status(200).json({ success: true, data: result });
}
