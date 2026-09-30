export type UserRole = "PASSENGER" | "DRIVER";

export interface SessionUser {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  role: UserRole;
  /**
   * Returned by /api/auth/me. Always present — it is a column on every user,
   * not a driver-only concept — but only meaningful for DRIVER, where it is
   * what decides whether ride requests are served.
   */
  isOnline: boolean;
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
    /**
     * Lets the UI tell "the server said no" apart from "we never reached the
     * server". Without this, every panel renders the same message and a
     * switched-off backend looks like a bug in the app.
     */
    readonly kind: "http" | "network" | "timeout" = "http",
  ) {
    super(message);
    this.name = "ApiError";
  }

  /** True when retrying might plausibly work. */
  get isTransient() {
    return this.kind !== "http" || this.status >= 500;
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

// Without this, an API that accepts the connection and then never answers
// leaves the panel spinning forever with no way back.
const REQUEST_TIMEOUT_MS = 12_000;

export const API_UNREACHABLE_MESSAGE =
  "Can't reach the Dhaka Tesla Pool API. Check that the backend is running.";
export const API_TIMEOUT_MESSAGE =
  "The API took too long to respond. Try again.";

/**
 * A readable message for anything thrown by this module or by a component.
 * Every panel needs this, and getting it wrong means showing the user a raw
 * browser string like "Failed to fetch".
 */
export function errorText(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

/** True when the request never reached the API, so a retry may work. */
export function isApiUnreachable(error: unknown): boolean {
  return error instanceof ApiError && error.kind !== "http";
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  token?: string,
): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      ...init,
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (cause) {
    // fetch() rejects for two very different reasons, and both arrive here as
    // an opaque TypeError. Left alone, the panels render "Failed to fetch" —
    // a browser string the user can do nothing with. AbortSignal.timeout()
    // surfaces its own name, so the two can be told apart.
    const timedOut =
      cause instanceof DOMException && cause.name === "TimeoutError";

    throw new ApiError(
      timedOut ? API_TIMEOUT_MESSAGE : API_UNREACHABLE_MESSAGE,
      timedOut ? 504 : 0,
      timedOut ? "timeout" : "network",
    );
  }

  const payload = (await response.json().catch(() => null)) as
    | ApiEnvelope<T>
    | ApiFailure
    | null;

  if (!response.ok) {
    const message =
      payload && "error" in payload ? payload.error?.message : null;
    throw new ApiError(
      message ?? "The server could not complete your request.",
      response.status,
      "http",
    );
  }

  if (!payload || !("data" in payload)) {
    throw new ApiError(
      "The server returned an unexpected response.",
      response.status,
    );
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

// ── Driver types ────────────────────────────────────────────────────────────

export interface Vehicle {
  id: string;
  name: string;
  model: string;
  plateNumber: string;
  seatCapacity: number;
  isActive: boolean;
}

export type PoolStatus =
  | "OPEN"
  | "DRIVER_ARRIVED"
  | "STARTED"
  | "COMPLETED"
  | "CANCELLED";

export interface PoolMember {
  id: string;
  user: { id: string; name: string; phone: string };
  seatsTaken: number;
  rideRequest: {
    id: string;
    status: RideStatus;
    seatsRequested: number;
    originZone: Zone;
    destinationZone: Zone;
  };
}

export interface ActivePool {
  id: string;
  status: PoolStatus;
  maxSeats: number;
  availableSeats: number;
  occupiedSeats: number;
  originZone: Zone;
  destinationZone: Zone;
  vehicle: Vehicle;
  memberships: PoolMember[];
  startedAt: string | null;
  createdAt: string;
}

export interface PoolHistoryEntry extends ActivePool {
  completedAt: string | null;
  cancelledAt: string | null;
}

export interface PoolTimelineEntry {
  id: string;
  rideRequestId: string | null;
  status: RideStatus | PoolStatus;
  note: string | null;
  changedById: string;
  createdAt: string;
  rideRequest: {
    passenger: { id: string; name: string };
  } | null;
}

export interface OpenRideRequest {
  id: string;
  status: "REQUESTED";
  seatsRequested: number;
  paymentMethod: PaymentMethod;
  requestedAt: string;
  originZone: Zone;
  destinationZone: Zone;
}

export interface AcceptRideResult {
  rideRequest: {
    id: string;
    status: RideStatus;
    originZone: Zone;
    destinationZone: Zone;
  };
  pool: ActivePool;
}

// ── Driver API functions ─────────────────────────────────────────────────────

export function setDriverStatus(token: string, isOnline: boolean) {
  return request<{ isOnline: boolean }>(
    "/api/drivers/me/status",
    { method: "PATCH", body: JSON.stringify({ isOnline }) },
    token,
  );
}

export function getMyVehicles(token: string) {
  return request<Vehicle[]>("/api/vehicles/me", {}, token);
}

export function getOpenRideRequests(token: string) {
  return request<OpenRideRequest[]>("/api/rides/open", {}, token);
}

export function acceptRideRequest(
  token: string,
  rideRequestId: string,
  vehicleId: string,
) {
  return request<AcceptRideResult>(
    `/api/rides/${encodeURIComponent(rideRequestId)}/accept`,
    { method: "POST", body: JSON.stringify({ vehicleId }) },
    token,
  );
}

export function getActivePool(token: string) {
  return request<ActivePool>("/api/pools/me/active", {}, token);
}

export function getPoolById(token: string, poolId: string) {
  return request<ActivePool>(
    `/api/pools/${encodeURIComponent(poolId)}`,
    {},
    token,
  );
}

export function getPoolTimeline(token: string, poolId: string) {
  return request<PoolTimelineEntry[]>(
    `/api/pools/${encodeURIComponent(poolId)}/history`,
    {},
    token,
  );
}

export function getPoolHistory(token: string) {
  return request<PoolHistoryEntry[]>("/api/pools/me/history", {}, token);
}

// ── Lifecycle types ──────────────────────────────────────────────────────────

/** Shape returned by all pool lifecycle endpoints (arrive/start/complete/cancel) */
export interface LifecyclePool extends ActivePool {
  completedAt: string | null;
  cancelledAt: string | null;
}

/** Payment record attached to a completed ride — driver-facing view */
export interface DriverPayment {
  id: string;
  amount: number | string;
  method: PaymentMethod;
  status: "PENDING" | "PAID" | "FAILED";
  paidAt: string | null;
  transactionId: string | null;
  rideRequest: {
    id: string;
    passengerId: string;
  };
}

/** Wallet balance returned by GET /api/wallet */
export interface WalletBalance {
  id: string;
  name: string;
  walletBalance: number | string;
}

/** Topup result returned by POST /api/wallet/topup */
export interface TopupResult {
  id: string;
  walletBalance: number | string;
}

// ── Driver lifecycle API functions ───────────────────────────────────────────

export function arriveAtPickup(token: string, poolId: string) {
  return request<LifecyclePool>(
    `/api/pools/${encodeURIComponent(poolId)}/arrive`,
    { method: "POST" },
    token,
  );
}

export function startTrip(token: string, poolId: string) {
  return request<LifecyclePool>(
    `/api/pools/${encodeURIComponent(poolId)}/start`,
    { method: "POST" },
    token,
  );
}

export function completeTrip(token: string, poolId: string) {
  return request<LifecyclePool>(
    `/api/pools/${encodeURIComponent(poolId)}/complete`,
    { method: "POST" },
    token,
  );
}

export function cancelTrip(token: string, poolId: string, reason?: string) {
  return request<LifecyclePool>(
    `/api/pools/${encodeURIComponent(poolId)}/cancel`,
    { method: "POST", body: JSON.stringify({ reason: reason ?? "" }) },
    token,
  );
}

// ── Payment API functions ────────────────────────────────────────────────────

/** Driver marks a cash payment as collected for one passenger */
export function collectPayment(token: string, paymentId: string) {
  return request<DriverPayment>(
    `/api/payments/${encodeURIComponent(paymentId)}/collect`,
    { method: "POST" },
    token,
  );
}

/** Get the payment record for a specific ride request (driver or passenger) */
export function getPaymentForRide(token: string, rideRequestId: string) {
  return request<DriverPayment>(
    `/api/payments/ride/${encodeURIComponent(rideRequestId)}`,
    {},
    token,
  );
}

// ── Wallet API functions (passenger) ────────────────────────────────────────

export function getWalletBalance(token: string) {
  return request<WalletBalance>("/api/wallet", {}, token);
}

export function topupWallet(token: string, amount: number) {
  return request<TopupResult>(
    "/api/wallet/topup",
    { method: "POST", body: JSON.stringify({ amount }) },
    token,
  );
}
