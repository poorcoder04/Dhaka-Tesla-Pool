import type { User } from "../../generated/prisma/client.js";

export type SafeUser = Omit<User, "password">;

export function toSafeUser(user: User): SafeUser {
  const { password: _password, ...safe } = user;
  return safe;
}