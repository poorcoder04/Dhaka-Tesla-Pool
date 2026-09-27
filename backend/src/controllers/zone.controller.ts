import type { Request, Response } from "express";
import * as zoneService from "../services/zone.service.js";

export async function list(_req: Request, res: Response): Promise<void> {
  const zones = await zoneService.listZones();
  res.status(200).json({ success: true, data: zones });
}

export async function getOne(req: Request, res: Response): Promise<void> {
  const zone = await zoneService.getZoneById(req.params.id as string);
  res.status(200).json({ success: true, data: zone });
}
