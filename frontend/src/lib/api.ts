export type UserRole = "PASSENGER" | "DRIVER";

export interface SessionUser {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  role: UserRole;
}

export interface AuthResult {
  user: SessionUser;
  token: string;
}

export interface SignupInput {
  name: string;
  phone: string;
  email?: string;
  password: string;
  role: UserRole;
  vehicle?: {
    name: string;
    model: string;
    plateNumber: string;
    seatCapacity: number;
  };
}

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "ApiError";
  }
}

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
}

interface ApiFailure {
  error?: { message?: string };
}

const apiBaseUrl = (
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000"
).replace(/\/$/, "");

async function request<T>(
  path: string,
  init: RequestInit = {},
  token?: string,
): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers,
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => null)) as
    | ApiEnvelope<T>
    | ApiFailure
    | null;

  if (!response.ok) {
    const message = payload && "error" in payload ? payload.error?.message : null;
    throw new ApiError(
      message ?? "The server could not complete your request.",
      response.status,
    );
  }

  if (!payload || !("data" in payload)) {
    throw new Error("The server returned an unexpected response.");
  }

  return payload.data;
}

export function login(phone: string, password: string) {
  return request<AuthResult>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ phone, password }),
  });
}

export function signup(input: SignupInput) {
  return request<AuthResult>("/api/auth/signup", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function getCurrentUser(token: string) {
  return request<SessionUser>("/api/auth/me", {}, token);
}