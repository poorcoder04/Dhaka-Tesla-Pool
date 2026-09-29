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

export interface Zone {
  id: string;
  name: string;
  description: string | null;
}

export type PaymentMethod = "CASH" | "WALLET";

export interface FareBreakdown {
  baseFare: number;
  distanceKm: number;
  distanceCharge: number;
  subtotal: number;
  poolDiscountPercentage: number;
  poolDiscountAmount: number;
  finalFare: number;
}

export interface FareEstimate {
  solo: FareBreakdown;
  twoPassengerPool: FareBreakdown;
  threePassengerPool: FareBreakdown;
}

export interface RideRequestResult {
  id: string;
  status: "REQUESTED";
  seatsRequested: number;
  paymentMethod: PaymentMethod;
  estimatedFare: number;
  originZone: Zone;
  destinationZone: Zone;
}

export type RideStatus =
  | "REQUESTED"
  | "MATCHED"
  | "DRIVER_ARRIVED"
  | "STARTED"
  | "COMPLETED"
  | "CANCELLED";

export interface PassengerRide {
  id: string;
  status: RideStatus;
  seatsRequested: number;
  paymentMethod: PaymentMethod;
  requestedAt: string;
  matchedAt: string | null;
  cancelledAt: string | null;
  originZone: Zone;
  destinationZone: Zone;
}

export interface PassengerRideDetails extends PassengerRide {
  pool: {
    id: string;
    status: RideStatus;
    driver: { name: string };
    vehicle: { name: string; plateNumber: string | null };
  } | null;
}

export interface RideHistoryEntry {
  id: string;
  status: RideStatus;
  note: string | null;
  createdAt: string;
}

export interface RidePayment {
  amount: number | string;
  method: PaymentMethod;
  status: "PENDING" | "PAID" | "FAILED";
  paidAt: string | null;
  transactionId: string | null;
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
  constructor(
    message: string,
    readonly status: number,
  ) {
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
    ApiEnvelope<T> | ApiFailure | null;

  if (!response.ok) {
    const message =
      payload && "error" in payload ? payload.error?.message : null;
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

export function getZones() {
  return request<Zone[]>("/api/zones");
}

interface FareEstimateResponse {
  soloFare: FareBreakdown;
  estimatedPoolFares: {
    twoPasssengers: FareBreakdown;
    threePassengers: FareBreakdown;
  };
}

export async function estimateRideFare(
  token: string,
  originZoneId: string,
  destinationZoneId: string,
  seatsRequested: number,
): Promise<FareEstimate> {
  const result = await request<FareEstimateResponse>(
    "/api/fares/estimate",
    {
      method: "POST",
      body: JSON.stringify({
        originZoneId,
        destinationZoneId,
        seatsRequested,
      }),
    },
    token,
  );

  return {
    solo: result.soloFare,
    twoPassengerPool: result.estimatedPoolFares.twoPasssengers,
    threePassengerPool: result.estimatedPoolFares.threePassengers,
  };
}

export function createRideRequest(
  token: string,
  input: {
    originZoneId: string;
    destinationZoneId: string;
    seatsRequested: number;
    paymentMethod: PaymentMethod;
  },
) {
  return request<RideRequestResult>(
    "/api/rides",
    {
      method: "POST",
      body: JSON.stringify(input),
    },
    token,
  );
}

export function getMyRideRequests(token: string) {
  return request<PassengerRide[]>("/api/rides/me", {}, token);
}

export function getRideRequest(token: string, rideRequestId: string) {
  return request<PassengerRideDetails>(
    `/api/rides/${encodeURIComponent(rideRequestId)}`,
    {},
    token,
  );
}

export function getRideRequestHistory(token: string, rideRequestId: string) {
  return request<RideHistoryEntry[]>(
    `/api/rides/${encodeURIComponent(rideRequestId)}/history`,
    {},
    token,
  );
}

export function cancelRideRequest(token: string, rideRequestId: string) {
  return request<PassengerRide>(
    `/api/rides/${encodeURIComponent(rideRequestId)}/cancel`,
    { method: "PATCH" },
    token,
  );
}

export function getRidePayment(token: string, rideRequestId: string) {
  return request<RidePayment>(
    `/api/payments/ride/${encodeURIComponent(rideRequestId)}`,
    {},
    token,
  );
}
