import type { Request, Response } from "express";
import * as driverService from "../services/driver.service.js";
import { AppError } from "../utils/AppError.js";

export async function setStatus(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new AppError("Authentication required", 401);

  const { isOnline } = req.body as { isOnline: boolean };
  const user = await driverService.setOnlineStatus(req.user.id, isOnline);
  res.status(200).json({ success: true, data: { isOnline: user.isOnline } });
}
