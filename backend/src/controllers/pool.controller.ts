import type { Request, Response } from "express";
import * as poolService from "../services/pool.service.js";
import { AppError } from "../utils/AppError.js";

export async function getActive(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new AppError("Authentication required", 401);

  const pool = await poolService.getActivePoolForDriver(req.user.id);
  res.status(200).json({ success: true, data: pool });
}
