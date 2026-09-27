import type { Request, Response } from "express";
import * as rideRequestService from "../services/rideRequest.service.js";
import { AppError } from "../utils/AppError.js";

export async function create(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new AppError("Authentication required", 401);

  const rideRequest = await rideRequestService.createRideRequest(req.user.id, req.body);
  res.status(201).json({ success: true, data: rideRequest });
}

// passenger's own ride request history
export async function listMine(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new AppError("Authentication required", 401);

  const rideRequests = await rideRequestService.listMyRideRequests(req.user.id);
  res.status(200).json({ success: true, data: rideRequests });
}

export async function getOne(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new AppError("Authentication required", 401);

  const rideRequest = await rideRequestService.getRideRequestById(
    req.params.id as string,
    req.user.id
  );
  res.status(200).json({ success: true, data: rideRequest });
}

export async function cancel(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new AppError("Authentication required", 401);

  const rideRequest = await rideRequestService.cancelRideRequest(
    req.params.id as string,
    req.user.id
  );
  res.status(200).json({ success: true, data: rideRequest });
}
