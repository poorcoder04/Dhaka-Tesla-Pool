import type { Request, Response } from "express";
import * as vehicleService from "../services/vehicle.service.js";
import { AppError } from "../utils/AppError.js";

export async function create(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new AppError("Authentication required", 401);

  const vehicle = await vehicleService.createVehicle(req.user.id, req.body);
  res.status(201).json({ success: true, data: vehicle });
}

// driver's own vehicles
export async function listMine(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new AppError("Authentication required", 401);

  const vehicles = await vehicleService.listMyVehicles(req.user.id);
  res.status(200).json({ success: true, data: vehicles });
}

export async function getOne(req: Request, res: Response): Promise<void> {
  const vehicle = await vehicleService.getVehicleById(req.params.id as string);
  res.status(200).json({ success: true, data: vehicle });
}

export async function update(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new AppError("Authentication required", 401);

  const vehicle = await vehicleService.updateVehicle(
    req.params.id as string,
    req.user.id,
    req.body
  );
  res.status(200).json({ success: true, data: vehicle });
}