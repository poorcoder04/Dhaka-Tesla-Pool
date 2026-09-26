import type { Request, Response } from "express";
import * as authService from "../services/auth.service.js";
import { AppError } from "../utils/AppError.js";
import { prisma } from "../lib/prisma.js";
import { toSafeUser } from "../utils/safeUser.js";

export async function signup(req: Request, res: Response): Promise<void> {
  const result = await authService.signup(req.body);
  res.status(201).json({ success: true, data: result });
}

export async function login(req: Request, res: Response): Promise<void> {
  const result = await authService.login(req.body);
  res.status(200).json({ success: true, data: result });
}

// for authentication
export async function me(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    throw new AppError("Not authenticated", 401);
  }

  const user = await prisma.user.findUnique({ where: { id: req.user.id } });

  if (!user) {
    throw new AppError("User not found", 404);
  }

  res.status(200).json({ success: true, data: toSafeUser(user) });
}