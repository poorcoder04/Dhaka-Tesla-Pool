"use client";

import {
  ApiError,
  acceptRideRequest,
  getActivePool,
  getMyVehicles,
  getOpenRideRequests,
  getPoolHistory,
  getPoolTimeline,
  setDriverStatus,
  type ActivePool,
  type OpenRideRequest,
  type PoolHistoryEntry,
  type PoolTimelineEntry,
  type Vehicle,
} from "@/lib/api";
import { useEffect, useRef, useState } from "react";

interface DriverPanelProps {
  token: string;
  driverName: string;
}

type DriverView = "dashboard" | "history";

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("en-BD", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

// ── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const label = status.replaceAll("_", " ");
  const cls =
    status === "OPEN"
      ? "badge-open"
      : status === "DRIVER_ARRIVED"
        ? "badge-arrived"
        : status === "STARTED"
          ? "badge-started"
          : status === "COMPLETED"
            ? "badge-completed"
            : status === "CANCELLED"
              ? "badge-cancelled"
              : status === "REQUESTED"
                ? "badge-requested"
                : status === "MATCHED"
                  ? "badge-matched"
                  : "";
  return <span className={`driver-badge ${cls}`}>{label}</span>;
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
      setError(
        err instanceof Error ? err.message : "Could not update your status.",
      );
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
      {error && (
        <p className="driver-inline-error" role="alert">
          {error}
        </p>
      )}
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

function AcceptModal({
  token,
  ride,
  vehicles,
  hasActivePool,
  onAccepted,
  onClose,
}: AcceptModalProps) {
  const [selectedVehicleId, setSelectedVehicleId] = useState(
    vehicles[0]?.id ?? "",
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleAccept() {
    if (!selectedVehicleId) return;
    setIsSubmitting(true);
    setError("");
    try {
      const result = await acceptRideRequest(token, ride.id, selectedVehicleId);
      onAccepted(result.pool);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not accept this ride.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div
      className="driver-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="accept-modal-heading"
    >
      <div className="driver-modal">
        <div className="driver-modal-header">
          <div>
            <p className="eyebrow">ACCEPT RIDE REQUEST</p>
            <h2 id="accept-modal-heading">
              {ride.originZone.name} → {ride.destinationZone.name}
            </h2>
          </div>
          <button
            className="driver-modal-close"
            type="button"
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="driver-modal-details">
          <div>
            <span className="ride-detail-label">SEATS REQUESTED</span>
            <strong>{ride.seatsRequested}</strong>
          </div>
          <div>
            <span className="ride-detail-label">PAYMENT</span>
            <strong>
              {ride.paymentMethod === "CASH" ? "Cash" : "TeslaPay wallet"}
            </strong>
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
            <label className="field-label" htmlFor="vehicle-select">
              Select vehicle
            </label>
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
              {vehicles[0]!.name} — {vehicles[0]!.plateNumber} (
              {vehicles[0]!.seatCapacity} seats)
            </strong>
          </div>
        )}

        {vehicles.length === 0 && (
          <p className="driver-inline-error">
            You have no active vehicles. Register a vehicle first.
          </p>
        )}

        {error && (
          <p className="driver-inline-error" role="alert">
            {error}
          </p>
        )}

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

function OpenRequestsList({
  token,
  vehicles,
  hasActivePool,
  onAccepted,
}: OpenRequestsListProps) {
  const [rides, setRides] = useState<OpenRideRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pendingRide, setPendingRide] = useState<OpenRideRequest | null>(null);

  async function loadRides(showRefresh = false) {
    if (showRefresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setError("");
    try {
      const data = await getOpenRideRequests(token);
      setRides(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not load ride requests.",
      );
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
          setError(err instanceof Error ? err.message : "Could not load ride requests.");
      })
      .finally(() => { if (isCurrent) setIsLoading(false); });
    return () => { isCurrent = false; };
  }, [token]);

  function handleAccepted(pool: ActivePool) {
    setPendingRide(null);
    onAccepted(pool);
  }

  if (isLoading) {
    return (
      <div className="driver-section">
        <div className="driver-loading">Loading open ride requests...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="driver-section">
        <div className="driver-error-row">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => void loadRides()}
            className="driver-text-action"
          >
            Retry
          </button>
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
        <div className="driver-empty">
          No open ride requests right now. Check back in a moment.
        </div>
      ) : (
        <ul className="driver-request-list">
          {rides.map((ride) => (
            <li className="driver-request-card" key={ride.id}>
              <div className="driver-request-route">
                <span className="driver-request-zone">
                  {ride.originZone.name}
                </span>
                <span className="driver-route-arrow" aria-hidden="true" />
                <span className="driver-request-zone">
                  {ride.destinationZone.name}
                </span>
              </div>
              <div className="driver-request-meta">
                <span>
                  <span className="ride-detail-label">SEATS </span>
                  {ride.seatsRequested}
                </span>
                <span>
                  <span className="ride-detail-label">PAYMENT </span>
                  {ride.paymentMethod === "CASH" ? "Cash" : "TeslaPay"}
                </span>
                <span>
                  <span className="ride-detail-label">REQUESTED </span>
                  {formatDate(ride.requestedAt)}
                </span>
              </div>
              <button
                className="driver-accept-card-button"
                type="button"
                onClick={() => setPendingRide(ride)}
              >
                Accept
                <span aria-hidden="true">→</span>
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
          onClose={() => setPendingRide(null)}
        />
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
  const [timeline, setTimeline] = useState<PoolTimelineEntry[]>([]);
  const [isLoadingTimeline, setIsLoadingTimeline] = useState(true);
  const [timelineError, setTimelineError] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    let isCurrent = true;

    getPoolTimeline(token, pool.id)
      .then((entries) => {
        if (isCurrent) {
          setTimeline(entries);
          setIsLoadingTimeline(false);
        }
      })
      .catch((err: unknown) => {
        if (isCurrent) {
          setTimelineError(
            err instanceof Error
              ? err.message
              : "Could not load trip timeline.",
          );
          setIsLoadingTimeline(false);
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [pool.id, token]);

  async function handleRefresh() {
    setIsRefreshing(true);
    try {
      const fresh = await getActivePool(token).catch((err: unknown) => {
        if (err instanceof ApiError && err.status === 404) return null;
        throw err;
      });
      onPoolUpdated(fresh);
      if (fresh) {
        const entries = await getPoolTimeline(token, fresh.id);
        setTimeline(entries);
      }
    } catch (err) {
      setTimelineError(
        err instanceof Error ? err.message : "Could not refresh trip status.",
      );
    } finally {
      setIsRefreshing(false);
    }
  }

  const liveMembers = pool.memberships.filter((m) =>
    ["MATCHED", "DRIVER_ARRIVED", "STARTED"].includes(m.rideRequest.status),
  );

  return (
    <div className="driver-section">
      {/* Trip header */}
      <div className="driver-section-heading">
        <div>
          <p className="eyebrow">DRIVER / ACTIVE TRIP</p>
          <h2>
            {pool.originZone.name} → {pool.destinationZone.name}
          </h2>
        </div>
        <div className="driver-heading-right">
          <StatusBadge status={pool.status} />
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
          <strong>{pool.vehicle.name}</strong>
          <small>{pool.vehicle.plateNumber}</small>
        </div>
        <div className="driver-seat-card">
          <span className="ride-detail-label">TOTAL SEATS</span>
          <strong>{pool.maxSeats}</strong>
        </div>
        <div className="driver-seat-card driver-seat-card-occupied">
          <span className="ride-detail-label">OCCUPIED</span>
          <strong>{pool.occupiedSeats}</strong>
        </div>
        <div className="driver-seat-card">
          <span className="ride-detail-label">AVAILABLE</span>
          <strong>{pool.availableSeats}</strong>
        </div>
      </div>

      {/* Passenger list */}
      <div className="driver-passengers">
        <p className="eyebrow">PASSENGERS IN THIS TRIP</p>
        {liveMembers.length === 0 ? (
          <div className="driver-empty">No active passengers in this trip.</div>
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
                    {member.rideRequest.originZone.name} →{" "}
                    {member.rideRequest.destinationZone.name}
                  </span>
                </div>
                <div className="driver-passenger-seats">
                  <span className="ride-detail-label">SEATS</span>
                  <strong>{member.seatsTaken}</strong>
                </div>
                <StatusBadge status={member.rideRequest.status} />
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
          <p className="driver-inline-error" role="alert">
            {timelineError}
          </p>
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
                    <time dateTime={entry.createdAt}>
                      {formatDate(entry.createdAt)}
                    </time>
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
  const [loadingTimelineId, setLoadingTimelineId] = useState<string | null>(
    null,
  );
  const [loadedTimeline, setLoadedTimeline] = useState<{
    poolId: string;
    entries: PoolTimelineEntry[];
  } | null>(null);
  const [timelineError, setTimelineError] = useState<string | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    let isCurrent = true;
    getPoolHistory(token)
      .then((data) => {
        if (isCurrent) setPools(data);
      })
      .catch((err: unknown) => {
        if (isCurrent)
          setError(
            err instanceof Error ? err.message : "Could not load trip history.",
          );
      })
      .finally(() => {
        if (isCurrent) setIsLoading(false);
      });
    return () => {
      isCurrent = false;
    };
  }, [token]);

  async function toggleTimeline(poolId: string) {
    if (expandedId === poolId) {
      seq.current += 1;
      setExpandedId(null);
      return;
    }
    const s = ++seq.current;
    setExpandedId(poolId);
    setLoadingTimelineId(poolId);
    setTimelineError(null);
    try {
      const entries = await getPoolTimeline(token, poolId);
      if (seq.current === s) setLoadedTimeline({ poolId, entries });
    } catch (err) {
      if (seq.current === s)
        setTimelineError(
          err instanceof Error ? err.message : "Could not load timeline.",
        );
    } finally {
      if (seq.current === s) setLoadingTimelineId(null);
    }
  }

  if (isLoading)
    return <div className="driver-loading">Loading trip history...</div>;
  if (error)
    return (
      <p className="driver-inline-error" role="alert">
        {error}
      </p>
    );

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
        <div className="driver-empty">
          Completed and cancelled trips will appear here.
        </div>
      ) : (
        <ul className="driver-history-list">
          {pools.map((pool) => {
            const isExpanded = expandedId === pool.id;
            const tl =
              loadedTimeline?.poolId === pool.id ? loadedTimeline : null;
            return (
              <li className="driver-history-item" key={pool.id}>
                <button
                  className="driver-history-toggle"
                  type="button"
                  aria-expanded={isExpanded}
                  onClick={() => void toggleTimeline(pool.id)}
                >
                  <span className="driver-history-route">
                    <strong>
                      {pool.originZone.name} → {pool.destinationZone.name}
                    </strong>
                    <small>
                      {formatDate(pool.createdAt)} /{" "}
                      {pool.vehicle.name} /{" "}
                      {pool.maxSeats - pool.availableSeats} passenger
                      {pool.maxSeats - pool.availableSeats !== 1 ? "s" : ""}
                    </small>
                  </span>
                  <StatusBadge status={pool.status} />
                  <span className="history-toggle-label">
                    {isExpanded ? "Hide" : "View timeline"}
                  </span>
                </button>

                {isExpanded && (
                  <div className="driver-history-details">
                    {loadingTimelineId === pool.id ? (
                      <div className="driver-loading">Loading timeline...</div>
                    ) : timelineError ? (
                      <p className="driver-inline-error">{timelineError}</p>
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
                                <time dateTime={entry.createdAt}>
                                  {formatDate(entry.createdAt)}
                                </time>
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

  // Loading/error state for the initial data fetch
  const [isBooting, setIsBooting] = useState(true);
  const [bootError, setBootError] = useState("");

  // On mount: load vehicles + check for an existing active pool in parallel.
  // We don't block on isOnline — the driver may have been online in a previous
  // session; the backend is the source of truth, so we show offline by default
  // and let them toggle to reflect reality.
  useEffect(() => {
    let isCurrent = true;

    Promise.all([
      getMyVehicles(token),
      getActivePool(token).catch((err: unknown) => {
        // 404 just means no active trip — that's normal
        if (err instanceof ApiError && err.status === 404) return null;
        throw err;
      }),
    ])
      .then(([vehicleList, pool]) => {
        if (!isCurrent) return;
        setVehicles(vehicleList);
        setActivePool(pool);
        // If they have an active trip they must be online
        if (pool) setIsOnline(true);
      })
      .catch((err: unknown) => {
        if (isCurrent) {
          setBootError(
            err instanceof Error
              ? err.message
              : "Could not load driver data. Check the API and reload.",
          );
        }
      })
      .finally(() => {
        if (isCurrent) setIsBooting(false);
      });

    return () => {
      isCurrent = false;
    };
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
          <button
            type="button"
            className="driver-text-action"
            onClick={() => window.location.reload()}
          >
            Reload
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="driver-workspace" aria-labelledby="driver-heading">
      {/* Header */}
      <div className="driver-header">
        <div>
          <p className="eyebrow">DRIVER WORKSPACE</p>
          <h1 id="driver-heading">Good morning, {driverName}.</h1>
        </div>
        <div className="driver-view-tabs" role="tablist">
          <button
            role="tab"
            aria-selected={view === "dashboard"}
            className={view === "dashboard" ? "driver-tab-active" : ""}
            type="button"
            onClick={() => setView("dashboard")}
          >
            Dashboard
          </button>
          <button
            role="tab"
            aria-selected={view === "history"}
            className={view === "history" ? "driver-tab-active" : ""}
            type="button"
            onClick={() => setView("history")}
          >
            Trip history
          </button>
        </div>
      </div>

      {view === "history" ? (
        <PoolHistoryList token={token} />
      ) : (
        <>
          {/* Online/offline toggle */}
          <OnlineToggle
            token={token}
            isOnline={isOnline}
            onChange={setIsOnline}
          />

          {/* Active trip takes priority over the request list */}
          {activePool ? (
            <ActivePoolView
              token={token}
              pool={activePool}
              onPoolUpdated={(updated) => {
                setActivePool(updated);
                if (!updated) setIsOnline(false);
              }}
            />
          ) : isOnline ? (
            <OpenRequestsList
              token={token}
              vehicles={vehicles}
              hasActivePool={false}
              onAccepted={(pool) => {
                setActivePool(pool);
              }}
            />
          ) : (
            <div className="driver-offline-hint">
              <p className="eyebrow">WAITING</p>
              <p>Go online above to start seeing ride requests.</p>
            </div>
          )}
        </>
      )}
    </section>
  );
}
