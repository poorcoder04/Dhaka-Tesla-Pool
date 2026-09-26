import { prisma } from "../lib/prisma.js";
import { AppError } from "../utils/AppError.js";
import { hashPassword, comparePassword } from "../utils/password.js";
import { signToken } from "../utils/jwt.js";
import { toSafeUser } from "../utils/safeUser.js";
import type { LoginInput, SignupInput } from "../validators/auth.validator.js";

export async function signup(input: SignupInput) {
  const existing = await prisma.user.findUnique({ where: { phone: input.phone } });

  if (existing) {
    throw new AppError("An account with this phone number already exists", 409);
  }

  const hashed = await hashPassword(input.password);

  const user = await prisma.user.create({
    data: {
      name: input.name,
      phone: input.phone,
      email: input.email,
      role: input.role,
      password: hashed,
    },
  });

  const token = signToken({ sub: user.id, role: user.role });

  return { user: toSafeUser(user), token };
}

export async function login(input: LoginInput) {
  const user = await prisma.user.findUnique({ where: { phone: input.phone } });

  // Same error for "no such user" and "wrong password" 
  if (!user || !user.password) {
    throw new AppError("Invalid phone number or password", 401);
  }

  if (!user.isActive) {
    throw new AppError("This account has been deactivated", 403);
  }

  const isValid = await comparePassword(input.password, user.password);

  if (!isValid) {
    throw new AppError("Invalid phone number or password", 401);
  }

  const token = signToken({ sub: user.id, role: user.role });

  return { user: toSafeUser(user), token };
}