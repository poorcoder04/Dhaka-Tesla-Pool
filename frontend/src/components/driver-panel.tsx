"use client";

import {
  ApiError,
  acceptRideRequest,
  arriveAtPickup,
  cancelTrip,
  collectPayment,
  completeTrip,
  getActivePool,
  getMyVehicles,
  getOpenRideRequests,
  getPaymentForRide,
  getPoolHistory,
  getPoolTimeline,
  getCurrentUser,
  setDriverStatus,
  startTrip,
  errorText,
  type ActivePool,
  type DriverPayment,
  type LifecyclePool,
  type OpenRideRequest,
  type PoolHistoryEntry,
  type PoolMember,
  type PoolTimelineEntry,
  type Vehicle,
} from "@/lib/api";
import { useEffect, useRef, useState } from "react";

interface DriverPanelProps {
  token: string;
  driverName: string;
}

type DriverView = "dashboard" | "history";

function formatMoney(amount: number | string): string {
  return new Intl.NumberFormat("en-BD", {
    style: "currency",
    currency: "BDT",
    maximumFractionDigits: 2,
  }).format(Number(amount));
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("en-BD", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const label = status.replaceAll("_", " ");
  const cls =
    status === "OPEN" ? "badge-open"
    : status === "DRIVER_ARRIVED" ? "badge-arrived"
    : status === "STARTED" ? "badge-started"
    : status === "COMPLETED" ? "badge-completed"
    : status === "CANCELLED" ? "badge-cancelled"
    : status === "REQUESTED" ? "badge-requested"
    : status === "MATCHED" ? "badge-matched"
    : "";
  return <span className={`driver-badge ${cls}`}>{label}</span>;
}

// ── Payment status chip ───────────────────────────────────────────────────────

function PaymentChip({ status }: { status: "PENDING" | "PAID" | "FAILED" }) {
  const cls =
    status === "PAID" ? "payment-chip-paid"
    : status === "FAILED" ? "payment-chip-failed"
    : "payment-chip-pending";
  return <span className={`payment-chip ${cls}`}>{status}</span>;
}

// ── Online toggle ─────────────────────────────────────────────────────────────

interface OnlineToggleProps {
  token: string;
  isOnline: boolean;
  onChange: (next: boolean) => void;
}

function OnlineToggle({ token, isOnline, onChange }: OnlineToggleProps) {
  const [isToggling, setIsToggling] = useState(false);
  const [error, setError] = useState("");

  async function handleToggle() {
    setIsToggling(true);
    setError("");
    try {
      const result = await setDriverStatus(token, !isOnline);
      onChange(result.isOnline);
    } catch (err) {
      setError(errorText(err, "Could not update your status."));
    } finally {
      setIsToggling(false);
    }
  }

  return (
    <div className="driver-online-row">
      <div className="driver-online-info">
        <span
          className={`driver-status-dot ${isOnline ? "dot-online" : "dot-offline"}`}
          aria-hidden="true"
        />
        <div>
          <strong>{isOnline ? "You are online" : "You are offline"}</strong>
          <p>
            {isOnline
              ? "Open ride requests are visible below."
              : "Go online to see and accept ride requests."}
          </p>
        </div>
      </div>
      <button
        className={`driver-toggle-button ${isOnline ? "toggle-go-offline" : "toggle-go-online"}`}
        type="button"
        onClick={handleToggle}
        disabled={isToggling}
        aria-pressed={isOnline}
      >
        {isToggling ? "Updating..." : isOnline ? "Go offline" : "Go online"}
      </button>
      {error && <p className="driver-inline-error" role="alert">{error}</p>}
    </div>
  );
}

// ── Accept modal ──────────────────────────────────────────────────────────────

interface AcceptModalProps {
  token: string;
  ride: OpenRideRequest;
  vehicles: Vehicle[];
  hasActivePool: boolean;
  onAccepted: (pool: ActivePool) => void;
  onClose: () => void;
}

function AcceptModal({ token, ride, vehicles, hasActivePool, onAccepted, onClose }: AcceptModalProps) {
  const [selectedVehicleId, setSelectedVehicleId] = useState(vehicles[0]?.id ?? "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  // Escape closes, as it does in any dialog. Tab is trapped so focus cannot
  // wander behind the overlay, where a keyboard user would be editing a page
  // they cannot see.
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (isSubmitting) return;
        event.stopPropagation();
        onClose();
        return;
      }

      if (event.key !== "Tab") return;

      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), select:not([disabled]), input:not([disabled]), a[href]',
      );
      if (!focusable || focusable.length === 0) return;

      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isSubmitting, onClose]);

  // Move focus into the dialog, so a keyboard user is not left behind on the
  // Accept button they just pressed, underneath the overlay.
  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  async function handleAccept() {
    if (!selectedVehicleId) return;
    setIsSubmitting(true);
    setError("");
    try {
      const result = await acceptRideRequest(token, ride.id, selectedVehicleId);
      onAccepted(result.pool);
    } catch (err) {
      setError(errorText(err, "Could not accept this ride."));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="driver-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="accept-modal-heading" ref={dialogRef}>
      <div className="driver-modal">
        <div className="driver-modal-header">
          <div>
            <p className="eyebrow">ACCEPT RIDE REQUEST</p>
            <h2 id="accept-modal-heading">{ride.originZone.name} → {ride.destinationZone.name}</h2>
          </div>
          <button ref={closeRef} className="driver-modal-close" type="button" onClick={onClose} aria-label="Close accept ride dialog">✕</button>
        </div>

        <div className="driver-modal-details">
          <div>
            <span className="ride-detail-label">SEATS REQUESTED</span>
            <strong>{ride.seatsRequested}</strong>
          </div>
          <div>
            <span className="ride-detail-label">PAYMENT</span>
            <strong>{ride.paymentMethod === "CASH" ? "Cash" : "TeslaPay wallet"}</strong>
          </div>
          <div>
            <span className="ride-detail-label">REQUESTED</span>
            <strong>{formatDate(ride.requestedAt)}</strong>
          </div>
        </div>

        {hasActivePool && (
          <div className="driver-modal-pool-note">
            You have an active trip. This passenger will be added to it if the
            pickup zone and destination cluster match.
          </div>
        )}

        {!hasActivePool && vehicles.length > 1 && (
          <div className="driver-modal-vehicle">
            <label className="field-label" htmlFor="vehicle-select">Select vehicle</label>
            <select
              id="vehicle-select"
              value={selectedVehicleId}
              onChange={(e) => setSelectedVehicleId(e.target.value)}
            >
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} — {v.plateNumber} ({v.seatCapacity} seats)
                </option>
              ))}
            </select>
          </div>
        )}

        {!hasActivePool && vehicles.length === 1 && (
          <div className="driver-modal-vehicle-note">
            <span className="ride-detail-label">VEHICLE</span>
            <strong>
              {vehicles[0]!.name} — {vehicles[0]!.plateNumber} ({vehicles[0]!.seatCapacity} seats)
            </strong>
          </div>
        )}

        {vehicles.length === 0 && (
          <p className="driver-inline-error">You have no active vehicles. Register a vehicle first.</p>
        )}

        {error && <p className="driver-inline-error" role="alert">{error}</p>}

        <div className="driver-modal-actions">
          <button
            className="driver-accept-button"
            type="button"
            onClick={handleAccept}
            disabled={isSubmitting || vehicles.length === 0}
          >
            {isSubmitting ? "Accepting..." : "Accept ride"}
            <span aria-hidden="true">→</span>
          </button>
          <button
            className="driver-cancel-modal-button"
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Open ride requests list ───────────────────────────────────────────────────

interface OpenRequestsListProps {
  token: string;
  vehicles: Vehicle[];
  hasActivePool: boolean;
  onAccepted: (pool: ActivePool) => void;
}

function OpenRequestsList({ token, vehicles, hasActivePool, onAccepted }: OpenRequestsListProps) {
  const [rides, setRides] = useState<OpenRideRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pendingRide, setPendingRide] = useState<OpenRideRequest | null>(null);
  const acceptButtonRef = useRef<HTMLButtonElement | null>(null);

  function closeModal() {
    setPendingRide(null);
    // Hand focus back to the card that opened the dialog, so a keyboard user
    // is not dropped at the top of the page.
    acceptButtonRef.current?.focus();
  }

  async function loadRides(showRefresh = false) {
    if (showRefresh) setIsRefreshing(true);
    setError("");
    try {
      const data = await getOpenRideRequests(token);
      setRides(data);
    } catch (err) {
      setError(errorText(err, "Could not load ride requests."));
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }

  useEffect(() => {
    let isCurrent = true;
    getOpenRideRequests(token)
      .then((data) => { if (isCurrent) setRides(data); })
      .catch((err: unknown) => {
        if (isCurrent)
          setError(errorText(err, "Could not load ride requests."));
      })
      .finally(() => { if (isCurrent) setIsLoading(false); });
    return () => { isCurrent = false; };
  }, [token]);

  function handleAccepted(pool: ActivePool) {
    setPendingRide(null);
    onAccepted(pool);
    // The accepted request is no longer REQUESTED, so leaving it on screen
    // invites the driver to accept it again and get a 409. Reload rather than
    // filtering locally: one extra request is cheaper than guessing which
    // entries the server considers open.
    void loadRides();
  }

  if (isLoading) {
    return <div className="driver-section"><div className="driver-loading">Loading open ride requests...</div></div>;
  }

  if (error) {
    return (
      <div className="driver-section">
        <div className="driver-error-row">
          <span>{error}</span>
          <button type="button" onClick={() => void loadRides()} className="driver-text-action">Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div className="driver-section">
      <div className="driver-section-heading">
        <div>
          <p className="eyebrow">DRIVER / OPEN REQUESTS</p>
          <h2>Ride requests</h2>
        </div>
        <button
          className="refresh-status-button"
          type="button"
          onClick={() => void loadRides(true)}
          disabled={isRefreshing}
        >
          {isRefreshing ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {rides.length === 0 ? (
        <div className="driver-empty">No open ride requests right now. Check back in a moment.</div>
      ) : (
        <ul className="driver-request-list">
          {rides.map((ride) => (
            <li className="driver-request-card" key={ride.id}>
              <div className="driver-request-route">
                <span className="driver-request-zone">{ride.originZone.name}</span>
                <span className="driver-route-arrow" aria-hidden="true" />
                <span className="driver-request-zone">{ride.destinationZone.name}</span>
              </div>
              <div className="driver-request-meta">
                <span><span className="ride-detail-label">SEATS </span>{ride.seatsRequested}</span>
                <span><span className="ride-detail-label">PAYMENT </span>{ride.paymentMethod === "CASH" ? "Cash" : "TeslaPay"}</span>
                <span><span className="ride-detail-label">REQUESTED </span>{formatDate(ride.requestedAt)}</span>
              </div>
              <button
                ref={pendingRide?.id === ride.id ? acceptButtonRef : undefined}
                className="driver-accept-card-button"
                type="button"
                aria-haspopup="dialog"
                onClick={() => setPendingRide(ride)}
              >
                Accept<span aria-hidden="true">→</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {pendingRide && (
        <AcceptModal
          token={token}
          ride={pendingRide}
          vehicles={vehicles}
          hasActivePool={hasActivePool}
          onAccepted={handleAccepted}
          onClose={closeModal}
        />
      )}
    </div>
  );
}

// ── Passenger payment card ────────────────────────────────────────────────────
// Loaded lazily after the trip completes so we don't call getPaymentForRide
// during an active trip (payment record doesn't exist yet until completeTrip).

interface PassengerPaymentProps {
  token: string;
  member: PoolMember;
  poolCompleted: boolean;
}

function PassengerPaymentCard({ token, member, poolCompleted }: PassengerPaymentProps) {
  const rideRequestId = member.rideRequest.id;
  const [payment, setPayment] = useState<DriverPayment | null>(null);
  // Starts true: this component only renders after the trip ends, and the
  // fare is fetched immediately. It used to start false and was never set to
  // true, so the "Loading fare..." branch was dead code and a completed trip
  // showed a blank space where the fare should have been.
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [isCollecting, setIsCollecting] = useState(false);
  const [collectError, setCollectError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!poolCompleted) return;
    let isCurrent = true;

    getPaymentForRide(token, rideRequestId)
      .then((p) => {
        if (!isCurrent) return;
        setPayment(p);
        setIsLoading(false);
      })
      .catch((err: unknown) => {
        if (!isCurrent) return;
        // A completed trip with no payment row is missing data, not a failure
        // the driver can do anything about - say so rather than showing an
        // error for a fare that legitimately isn't there.
        if (err instanceof ApiError && err.status === 404) {
          setPayment(null);
          setError("");
        } else {
          setError(errorText(err, "Could not load this passenger's fare."));
        }
        setIsLoading(false);
      });

    return () => {
      isCurrent = false;
    };
  }, [poolCompleted, rideRequestId, token, reloadKey]);

  function handleRetry() {
    setIsLoading(true);
    setError("");
    setReloadKey((key) => key + 1);
  }

  async function handleCollect() {
    if (!payment) return;
    setIsCollecting(true);
    setCollectError("");
    try {
      const updated = await collectPayment(token, payment.id);
      setPayment(updated);
    } catch (err) {
      setCollectError(errorText(err, "Could not collect payment."));
    } finally {
      setIsCollecting(false);
    }
  }

  if (!poolCompleted) return null;

  if (isLoading) {
    return (
      <div className="passenger-payment-loading" aria-live="polite">
        Loading fare...
      </div>
    );
  }

  if (error) {
    return (
      <div className="passenger-payment-row">
        <p className="driver-inline-error" role="alert">
          {error}
        </p>
        <button
          className="driver-text-action"
          type="button"
          onClick={handleRetry}
        >
          Retry
        </button>
      </div>
    );
  }

  if (!payment) {
    return (
      <p className="history-payment">
        No fare was recorded for this passenger.
      </p>
    );
  }

  const canCollect =
    payment.method === "CASH" && payment.status === "PENDING";

  return (
    <div className="passenger-payment-row">
      <div className="passenger-fare">
        <span className="ride-detail-label">FARE</span>
        <strong>{formatMoney(payment.amount)}</strong>
      </div>
      <div className="passenger-payment-method">
        <span className="ride-detail-label">METHOD</span>
        <span>{payment.method === "CASH" ? "Cash" : "TeslaPay"}</span>
      </div>
      <div className="passenger-payment-status">
        <span className="ride-detail-label">PAYMENT</span>
        <PaymentChip status={payment.status} />
      </div>
      {canCollect && (
        <button
          className="collect-cash-button"
          type="button"
          onClick={handleCollect}
          disabled={isCollecting}
        >
          {isCollecting ? "Collecting..." : "Collect cash"}
        </button>
      )}
      {collectError && <p className="driver-inline-error collect-error">{collectError}</p>}
    </div>
  );
}

// ── Lifecycle actions ─────────────────────────────────────────────────────────

interface LifecycleActionsProps {
  token: string;
  pool: ActivePool;
  onPoolUpdated: (pool: ActivePool | null) => void;
  onError: (msg: string) => void;
}

function LifecycleActions({ token, pool, onPoolUpdated, onError }: LifecycleActionsProps) {
  const [isBusy, setIsBusy] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  async function runAction(action: () => Promise<LifecyclePool>) {
    setIsBusy(true);
    onError("");
    try {
      const updated = await action();
      // COMPLETED and CANCELLED pools are no longer "active" —
      // pass them up so the parent can move the pool out of the active slot
      // while still rendering the final state (parent decides).
      onPoolUpdated(updated);
    } catch (err) {
      onError(errorText(err, "Action failed. Try again."));
    } finally {
      setIsBusy(false);
    }
  }

  const status = pool.status;

  return (
    <div className="lifecycle-actions">
      <p className="eyebrow">TRIP ACTIONS</p>

      <div className="lifecycle-buttons">
        {/* OPEN → arrive */}
        {status === "OPEN" && (
          <button
            className="lifecycle-btn lifecycle-btn-arrive"
            type="button"
            disabled={isBusy}
            onClick={() => void runAction(() => arriveAtPickup(token, pool.id))}
          >
            {isBusy ? "Updating..." : "Mark arrived at pickup"}
          </button>
        )}

        {/* DRIVER_ARRIVED → start */}
        {status === "DRIVER_ARRIVED" && (
          <button
            className="lifecycle-btn lifecycle-btn-start"
            type="button"
            disabled={isBusy}
            onClick={() => void runAction(() => startTrip(token, pool.id))}
          >
            {isBusy ? "Starting..." : "Start trip"}
          </button>
        )}

        {/* STARTED → complete */}
        {status === "STARTED" && (
          <button
            className="lifecycle-btn lifecycle-btn-complete"
            type="button"
            disabled={isBusy}
            onClick={() => void runAction(() => completeTrip(token, pool.id))}
          >
            {isBusy ? "Completing..." : "Complete trip"}
          </button>
        )}

        {/* Cancel available while OPEN or DRIVER_ARRIVED */}
        {(status === "OPEN" || status === "DRIVER_ARRIVED") && !confirmCancel && (
          <button
            className="lifecycle-btn lifecycle-btn-cancel-trigger"
            type="button"
            disabled={isBusy}
            onClick={() => setConfirmCancel(true)}
          >
            Cancel trip
          </button>
        )}
      </div>

      {/* Cancel confirmation */}
      {confirmCancel && (
        <div className="lifecycle-cancel-confirm" role="group" aria-label="Confirm trip cancellation">
          <div>
            <strong>Cancel this trip?</strong>
            <p>All matched passengers will be notified.</p>
          </div>
          <input
            className="lifecycle-cancel-reason"
            type="text"
            placeholder="Reason (optional)"
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
          />
          <div className="lifecycle-cancel-actions">
            <button
              className="lifecycle-btn lifecycle-btn-cancel-confirm"
              type="button"
              disabled={isBusy}
              onClick={() =>
                void runAction(() =>
                  cancelTrip(token, pool.id, cancelReason || undefined),
                )
              }
            >
              {isBusy ? "Cancelling..." : "Confirm cancel"}
            </button>
            <button
              className="lifecycle-btn lifecycle-btn-keep"
              type="button"
              disabled={isBusy}
              onClick={() => { setConfirmCancel(false); setCancelReason(""); }}
            >
              Keep trip
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Active pool view ──────────────────────────────────────────────────────────

interface ActivePoolViewProps {
  token: string;
  pool: ActivePool;
  onPoolUpdated: (pool: ActivePool | null) => void;
}

function ActivePoolView({ token, pool, onPoolUpdated }: ActivePoolViewProps) {
  // localPool overrides the parent prop after a lifecycle action fires —
  // avoids a useEffect sync which triggers the set-state-in-effect lint rule.
  const [localPool, setLocalPool] = useState<ActivePool | null>(null);
  const currentPool = localPool ?? pool;const [timeline, setTimeline] = useState<PoolTimelineEntry[]>([]);
  const [isLoadingTimeline, setIsLoadingTimeline] = useState(true);
  const [timelineError, setTimelineError] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [actionError, setActionError] = useState("");


  useEffect(() => {
    let isCurrent = true;
    getPoolTimeline(token, currentPool.id)
      .then((entries) => {
        if (isCurrent) { setTimeline(entries); setIsLoadingTimeline(false); }
      })
      .catch((err: unknown) => {
        if (isCurrent) {
          setTimelineError(errorText(err, "Could not load trip timeline."));
          setIsLoadingTimeline(false);
        }
      });
    return () => { isCurrent = false; };
  }, [currentPool.id, token]);

  async function handleRefresh() {
    setIsRefreshing(true);
    setActionError("");
    try {
      const fresh = await getActivePool(token).catch((err: unknown) => {
        if (err instanceof ApiError && err.status === 404) return null;
        throw err;
      });
      if (fresh) {
        setLocalPool(fresh);
        const entries = await getPoolTimeline(token, fresh.id);
        setTimeline(entries);
      }
      onPoolUpdated(fresh);
    } catch (err) {
      setTimelineError(errorText(err, "Could not refresh trip status."));
    } finally {
      setIsRefreshing(false);
    }
  }

  function handleLifecycleUpdate(updated: ActivePool | null) {
    if (updated) {
      setLocalPool(updated);
      // Reload timeline to reflect the new status event
      getPoolTimeline(token, updated.id)
        .then(setTimeline)
        .catch(() => { /* non-critical */ });
    }
    onPoolUpdated(updated);
  }

  const isTerminal = currentPool.status === "COMPLETED" || currentPool.status === "CANCELLED";
  const liveMembers = currentPool.memberships.filter((m) =>
    ["MATCHED", "DRIVER_ARRIVED", "STARTED", "COMPLETED"].includes(m.rideRequest.status),
  );

  return (
    <div className="driver-section">
      {/* Trip header */}
      <div className="driver-section-heading">
        <div>
          <p className="eyebrow">DRIVER / ACTIVE TRIP</p>
          <h2>{currentPool.originZone.name} → {currentPool.destinationZone.name}</h2>
        </div>
        <div className="driver-heading-right">
          <StatusBadge status={currentPool.status} />
          <button
            className="refresh-status-button"
            type="button"
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            {isRefreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </div>

      {/* Seat summary */}
      <div className="driver-seat-summary">
        <div className="driver-seat-card">
          <span className="ride-detail-label">VEHICLE</span>
          <strong>{currentPool.vehicle.name}</strong>
          <small>{currentPool.vehicle.plateNumber}</small>
        </div>
        <div className="driver-seat-card">
          <span className="ride-detail-label">TOTAL SEATS</span>
          <strong>{currentPool.maxSeats}</strong>
        </div>
        <div className="driver-seat-card driver-seat-card-occupied">
          <span className="ride-detail-label">OCCUPIED</span>
          <strong>{currentPool.occupiedSeats}</strong>
        </div>
        <div className="driver-seat-card">
          <span className="ride-detail-label">AVAILABLE</span>
          <strong>{currentPool.availableSeats}</strong>
        </div>
      </div>

      {/* Lifecycle action buttons — not shown for terminal states */}
      {!isTerminal && (
        <LifecycleActions
          token={token}
          pool={currentPool}
          onPoolUpdated={handleLifecycleUpdate}
          onError={setActionError}
        />
      )}

      {actionError && (
        <p className="driver-inline-error" role="alert">{actionError}</p>
      )}

      {/* Passenger list */}
      <div className="driver-passengers">
        <p className="eyebrow">PASSENGERS IN THIS TRIP</p>
        {liveMembers.length === 0 ? (
          <div className="driver-empty">No passengers in this trip.</div>
        ) : (
          <ul className="driver-passenger-list">
            {liveMembers.map((member) => (
              <li className="driver-passenger-card" key={member.id}>
                <div className="driver-passenger-info">
                  <strong>{member.user.name}</strong>
                  <span>{member.user.phone}</span>
                </div>
                <div className="driver-passenger-route">
                  <span className="ride-detail-label">ROUTE</span>
                  <span>
                    {member.rideRequest.originZone.name} → {member.rideRequest.destinationZone.name}
                  </span>
                </div>
                <div className="driver-passenger-seats">
                  <span className="ride-detail-label">SEATS</span>
                  <strong>{member.seatsTaken}</strong>
                </div>
                <StatusBadge status={member.rideRequest.status} />
                {/* Fare + payment shown after trip completes */}
                <PassengerPaymentCard
                  token={token}
                  member={member}
                  poolCompleted={isTerminal}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Timeline */}
      <div className="driver-timeline-section">
        <p className="eyebrow">TRIP TIMELINE</p>
        {isLoadingTimeline ? (
          <div className="driver-loading">Loading timeline...</div>
        ) : timelineError ? (
          <p className="driver-inline-error" role="alert">{timelineError}</p>
        ) : timeline.length === 0 ? (
          <div className="driver-empty">No events recorded yet.</div>
        ) : (
          <ol className="ride-timeline">
            {timeline.map((entry, index) => (
              <li className="ride-timeline-entry" key={entry.id}>
                <span
                  className={`timeline-marker${index === timeline.length - 1 ? " timeline-marker-current" : ""}`}
                  aria-hidden="true"
                />
                <div className="timeline-entry-content">
                  <div className="timeline-entry-heading">
                    <strong>
                      {entry.rideRequest
                        ? `${entry.rideRequest.passenger.name} — ${String(entry.status).replaceAll("_", " ")}`
                        : String(entry.status).replaceAll("_", " ")}
                    </strong>
                    <time dateTime={entry.createdAt}>{formatDate(entry.createdAt)}</time>
                  </div>
                  {entry.note && <p>{entry.note}</p>}
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

// ── Pool history ──────────────────────────────────────────────────────────────

interface PoolHistoryListProps {
  token: string;
}

function PoolHistoryList({ token }: PoolHistoryListProps) {
  const [pools, setPools] = useState<PoolHistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loadingTimelineId, setLoadingTimelineId] = useState<string | null>(null);
  const [loadedTimeline, setLoadedTimeline] = useState<{ poolId: string; entries: PoolTimelineEntry[] } | null>(null);
  // Keyed by trip, not a bare string. With a single value, failing to load
  // trip A's timeline and then expanding trip B showed A's error under B.
  const [timelineError, setTimelineError] = useState<{ poolId: string; message: string } | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    let isCurrent = true;
    getPoolHistory(token)
      .then((data) => { if (isCurrent) setPools(data); })
      .catch((err: unknown) => {
        if (isCurrent) setError(errorText(err, "Could not load trip history."));
      })
      .finally(() => { if (isCurrent) setIsLoading(false); });
    return () => { isCurrent = false; };
  }, [token]);

  async function toggleTimeline(poolId: string) {
    if (expandedId === poolId) { seq.current += 1; setExpandedId(null); return; }
    const s = ++seq.current;
    setExpandedId(poolId);
    setLoadingTimelineId(poolId);
    setTimelineError(null);
    try {
      const entries = await getPoolTimeline(token, poolId);
      if (seq.current === s) setLoadedTimeline({ poolId, entries });
    } catch (err) {
      if (seq.current === s)
        setTimelineError({ poolId, message: errorText(err, "Could not load timeline.") });
    } finally {
      if (seq.current === s) setLoadingTimelineId(null);
    }
  }

  if (isLoading) return <div className="driver-loading">Loading trip history...</div>;
  if (error) return <p className="driver-inline-error" role="alert">{error}</p>;

  return (
    <div className="driver-section">
      <div className="driver-section-heading">
        <div>
          <p className="eyebrow">DRIVER / PAST TRIPS</p>
          <h2>Trip history</h2>
        </div>
        <span className="driver-history-count">{pools.length} trips</span>
      </div>

      {pools.length === 0 ? (
        <div className="driver-empty">Completed and cancelled trips will appear here.</div>
      ) : (
        <ul className="driver-history-list">
          {pools.map((pool) => {
            const isExpanded = expandedId === pool.id;
            const tl = loadedTimeline?.poolId === pool.id ? loadedTimeline : null;
            const thisTripError = timelineError?.poolId === pool.id ? timelineError : null;
            return (
              <li className="driver-history-item" key={pool.id}>
                <button
                  className="driver-history-toggle"
                  type="button"
                  aria-expanded={isExpanded}
                  onClick={() => void toggleTimeline(pool.id)}
                >
                  <span className="driver-history-route">
                    <strong>{pool.originZone.name} → {pool.destinationZone.name}</strong>
                    <small>
                      {formatDate(pool.createdAt)} / {pool.vehicle.name} /{" "}
                      {pool.maxSeats - pool.availableSeats} passenger
                      {pool.maxSeats - pool.availableSeats !== 1 ? "s" : ""}
                    </small>
                  </span>
                  <StatusBadge status={pool.status} />
                  <span className="history-toggle-label">{isExpanded ? "Hide" : "View timeline"}</span>
                </button>

                {isExpanded && (
                  <div className="driver-history-details">
                    {loadingTimelineId === pool.id ? (
                      <div className="driver-loading">Loading timeline...</div>
                    ) : thisTripError ? (
                      <p className="driver-inline-error" role="alert">
                        {thisTripError.message}
                      </p>
                    ) : tl && tl.entries.length > 0 ? (
                      <ol className="ride-timeline">
                        {tl.entries.map((entry, i) => (
                          <li className="ride-timeline-entry" key={entry.id}>
                            <span
                              className={`timeline-marker${i === tl.entries.length - 1 ? " timeline-marker-current" : ""}`}
                              aria-hidden="true"
                            />
                            <div className="timeline-entry-content">
                              <div className="timeline-entry-heading">
                                <strong>
                                  {entry.rideRequest
                                    ? `${entry.rideRequest.passenger.name} — ${String(entry.status).replaceAll("_", " ")}`
                                    : String(entry.status).replaceAll("_", " ")}
                                </strong>
                                <time dateTime={entry.createdAt}>{formatDate(entry.createdAt)}</time>
                              </div>
                              {entry.note && <p>{entry.note}</p>}
                            </div>
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <div className="driver-empty">No timeline entries.</div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ── Main driver panel ─────────────────────────────────────────────────────────

export default function DriverPanel({ token, driverName }: DriverPanelProps) {
  const [isOnline, setIsOnline] = useState(false);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [activePool, setActivePool] = useState<ActivePool | null>(null);
  const [view, setView] = useState<DriverView>("dashboard");
  const [isBooting, setIsBooting] = useState(true);
  const [bootError, setBootError] = useState("");

  useEffect(() => {
    let isCurrent = true;
    Promise.all([
      getMyVehicles(token),
      getActivePool(token).catch((err: unknown) => {
        if (err instanceof ApiError && err.status === 404) return null;
        throw err;
      }),
      // The stored online status, not a local guess. It used to be
      // initialised to false and only ever set true once a pool existed, so a
      // driver who was genuinely online but had no active trip was shown as
      // offline and told to go online — a state they were already in.
      getCurrentUser(token).catch(() => null),
    ])
      .then(([vehicleList, pool, user]) => {
        if (!isCurrent) return;
        setVehicles(vehicleList);
        setActivePool(pool);
        if (user) setIsOnline(user.isOnline);
        // An active trip means the driver is on the road whether or not the
        // status column agrees.
        if (pool) setIsOnline(true);
      })
      .catch((err: unknown) => {
        if (isCurrent)
          setBootError(errorText(err, "Could not load driver data. Check the API and reload."));
      })
      .finally(() => { if (isCurrent) setIsBooting(false); });
    return () => { isCurrent = false; };
  }, [token]);

  if (isBooting) {
    return (
      <section className="driver-workspace" aria-live="polite">
        <div className="driver-loading">Loading your driver workspace...</div>
      </section>
    );
  }

  if (bootError) {
    return (
      <section className="driver-workspace">
        <div className="driver-error-row">
          <span>{bootError}</span>
          <button type="button" className="driver-text-action" onClick={() => window.location.reload()}>Reload</button>
        </div>
      </section>
    );
  }

  return (
    <section className="driver-workspace" aria-labelledby="driver-heading">
      <div className="driver-header">
        <div>
          <p className="eyebrow">DRIVER WORKSPACE</p>
          <h1 id="driver-heading">Good morning, {driverName}.</h1>
        </div>
        <div className="driver-view-tabs" role="tablist" aria-label="Driver workspace views">
          <button
            id="driver-tab-dashboard"
            role="tab"
            aria-selected={view === "dashboard"}
            aria-controls="driver-panel-dashboard"
            tabIndex={view === "dashboard" ? 0 : -1}
            className={view === "dashboard" ? "driver-tab-active" : ""}
            type="button"
            onClick={() => setView("dashboard")}
          >
            Dashboard
          </button>
          <button
            id="driver-tab-history"
            role="tab"
            aria-selected={view === "history"}
            aria-controls="driver-panel-history"
            tabIndex={view === "history" ? 0 : -1}
            className={view === "history" ? "driver-tab-active" : ""}
            type="button"
            onClick={() => setView("history")}
          >
            Trip history
          </button>
        </div>
      </div>

      {view === "history" ? (
        <div
          id="driver-panel-history"
          role="tabpanel"
          aria-labelledby="driver-tab-history"
        >
          <PoolHistoryList token={token} />
        </div>
      ) : (
        <div
          id="driver-panel-dashboard"
          role="tabpanel"
          aria-labelledby="driver-tab-dashboard"
        >
          <OnlineToggle token={token} isOnline={isOnline} onChange={setIsOnline} />

          {activePool ? (
            <>
              <ActivePoolView
                token={token}
                pool={activePool}
                onPoolUpdated={(updated) => {
                  setActivePool(updated);
                  if (!updated) setIsOnline(false);
                }}
              />
              {/* A driver with a live trip must still be able to add another
                  passenger to it — that is the entire point of pooling. The
                  backend has always supported this (it joins the existing
                  pool when the pickup zone and destination cluster match), but
                  the requests list used to be unmounted the moment a pool
                  existed, so the one feature the product is named after was
                  unreachable from the UI.

                  Only while the pool is OPEN. Once the driver has arrived or
                  started, the server rejects every new passenger with "your
                  current trip is already underway", so offering the button
                  there would be an Accept that can only fail. A pool stays
                  OPEN from creation until arrival, so this is exactly the
                  window in which passengers can still join.

                  Requests that do not fit the current trip stay listed: the
                  destination cluster is server-side knowledge, and the server
                  explains the mismatch on accept far better than a client-side
                  guess would. */}
              {activePool.status === "OPEN" && (
                <OpenRequestsList
                  token={token}
                  vehicles={vehicles}
                  hasActivePool
                  onAccepted={(pool) => setActivePool(pool)}
                />
              )}
            </>
          ) : isOnline ? (
            <>
              {/* Online with no Tesla: the requests list would still load and
                  offer an Accept button that can only fail. Say so up front. */}
              {vehicles.length === 0 && (
                <div className="driver-no-vehicle" role="status">
                  <p className="eyebrow">NO TESLA REGISTERED</p>
                  <p>
                    You are online, but ride requests need a vehicle before you
                    can accept one. Register a Tesla to start taking trips.
                  </p>
                </div>
              )}
              <OpenRequestsList
                token={token}
                vehicles={vehicles}
                hasActivePool={false}
                onAccepted={(pool) => setActivePool(pool)}
              />
            </>
          ) : (
            <div className="driver-offline-hint">
              <p className="eyebrow">WAITING</p>
              <p>Go online above to start seeing ride requests.</p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
