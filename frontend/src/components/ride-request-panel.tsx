"use client";

import {
  ApiError,
  cancelRideRequest,
  createRideRequest,
  errorText,
  estimateRideFare,
  getRideRequest,
  getRideRequestHistory,
  getRidePayment,
  getMyRideRequests,
  getWalletBalance,
  getZones,
  topupWallet,
  type FareEstimate,
  type PaymentMethod,
  type PassengerRide,
  type PassengerRideDetails,
  type RidePayment,
  type RideHistoryEntry,
  type RideRequestResult,
  type RideStatus,
  type WalletBalance,
  type Zone,
} from "@/lib/api";
import { useEffect, useRef, useState } from "react";

interface RideRequestPanelProps {
  token: string;
  passengerName: string;
}

interface QuoteSelection {
  originZoneId: string;
  destinationZoneId: string;
  seatsRequested: number;
}

const ACTIVE_RIDE_STATUSES: RideStatus[] = [
  "REQUESTED",
  "MATCHED",
  "DRIVER_ARRIVED",
  "STARTED",
];

const CANCELLABLE_RIDE_STATUSES: RideStatus[] = [
  "REQUESTED",
  "MATCHED",
  "DRIVER_ARRIVED",
];

function formatMoney(amount: number): string {
  return new Intl.NumberFormat("en-BD", {
    style: "currency",
    currency: "BDT",
    maximumFractionDigits: 2,
  }).format(amount);
}

function loadRideTracking(token: string, rideRequestId: string) {
  return Promise.all([
    getRideRequest(token, rideRequestId),
    getRideRequestHistory(token, rideRequestId),
  ]);
}

// ── Wallet panel ─────────────────────────────────────────────────────────────

function WalletPanel({
  token,
  onUnavailableChange,
}: {
  token: string;
  onUnavailableChange: (unavailable: boolean) => void;
}) {
  const [wallet, setWallet] = useState<WalletBalance | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [topupAmount, setTopupAmount] = useState("");
  const [isTopingUp, setIsTopingUp] = useState(false);
  const [topupError, setTopupError] = useState("");
  const [showTopup, setShowTopup] = useState(false);

  useEffect(() => {
    let isCurrent = true;
    getWalletBalance(token)
      .then((data) => { if (isCurrent) { setWallet(data); setIsLoading(false); } })
      .catch((err: unknown) => {
        if (isCurrent) {
          setError(errorText(err, "Could not load your wallet."));
          setIsLoading(false);
        }
      });
    return () => { isCurrent = false; };
  }, [token, reloadKey]);

  useEffect(() => {
    onUnavailableChange(Boolean(error));
  }, [error, onUnavailableChange]);

  function handleRetry() {
    setIsLoading(true);
    setError("");
    setReloadKey((key) => key + 1);
  }

  async function handleTopup(e: React.FormEvent) {
    e.preventDefault();
    const amount = Number(topupAmount);
    if (!amount || amount <= 0) { setTopupError("Enter a positive amount."); return; }
    setIsTopingUp(true);
    setTopupError("");
    try {
      const result = await topupWallet(token, amount);
      setWallet((prev) => prev ? { ...prev, walletBalance: result.walletBalance } : prev);
      setTopupAmount("");
      setShowTopup(false);
    } catch (err) {
      setTopupError(errorText(err, "Topup failed."));
    } finally {
      setIsTopingUp(false);
    }
  }

  // The wallet is not required to request a cash ride, so a failure must not
  // block the booking form. It used to render null, which left the passenger
  // with a TeslaPay option that silently did nothing and no way to find out
  // why. It now stays in place, showing what went wrong and a way to retry.
  if (error) {
    return (
      <div className="wallet-panel wallet-panel-unavailable">
        <div className="wallet-balance-row">
          <div className="wallet-balance-info">
            <span className="ride-detail-label">TESLAPAY WALLET</span>
            <strong className="wallet-amount">Unavailable</strong>
          </div>
          <button
            className="wallet-topup-trigger"
            type="button"
            onClick={handleRetry}
          >
            Retry
          </button>
        </div>
        <p className="ride-inline-error" role="alert">{error}</p>
        <p className="wallet-topup-note">
          You can still request a ride and pay cash.
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="wallet-panel" aria-live="polite">
        <div className="wallet-balance-row">
          <div className="wallet-balance-info">
            <span className="ride-detail-label">TESLAPAY WALLET</span>
            <strong className="wallet-amount">Loading...</strong>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="wallet-panel">
      <div className="wallet-balance-row">
        <div className="wallet-balance-info">
          <span className="ride-detail-label">TESLAPAY WALLET</span>
          <strong className="wallet-amount">
            ৳{Number(wallet?.walletBalance ?? 0).toFixed(2)}
          </strong>
        </div>
        <button
          className="wallet-topup-trigger"
          type="button"
          onClick={() => { setShowTopup((s) => !s); setTopupError(""); }}
        >
          {showTopup ? "Cancel" : "Add money"}
        </button>
      </div>

      {showTopup && (
        <form className="wallet-topup-form" onSubmit={(e) => void handleTopup(e)}>
          <label className="field-label" htmlFor="topup-amount">
            Amount (BDT)
          </label>
          <div className="wallet-topup-row">
            <input
              id="topup-amount"
              type="number"
              min="1"
              step="1"
              placeholder="e.g. 200"
              value={topupAmount}
              onChange={(e) => setTopupAmount(e.target.value)}
              required
            />
            <button
              className="wallet-topup-submit"
              type="submit"
              disabled={isTopingUp}
            >
              {isTopingUp ? "Adding..." : "Add"}
            </button>
          </div>
          {topupError && (
            <p className="ride-inline-error" role="alert">{topupError}</p>
          )}
          <p className="wallet-topup-note">
            Simulated TeslaPay wallet — no real payment processed.
          </p>
        </form>
      )}
    </div>
  );
}

export default function RideRequestPanel({
  token,
  passengerName,
}: RideRequestPanelProps) {
  const [zones, setZones] = useState<Zone[]>([]);
  const [originZoneId, setOriginZoneId] = useState("");
  const [destinationZoneId, setDestinationZoneId] = useState("");
  const [seatsRequested, setSeatsRequested] = useState(1);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const [fareEstimate, setFareEstimate] = useState<FareEstimate | null>(null);
  const [quotedSelection, setQuotedSelection] = useState<QuoteSelection | null>(
    null,
  );
  const [ride, setRide] = useState<RideRequestResult | null>(null);
  const [passengerRides, setPassengerRides] = useState<PassengerRide[]>([]);
  const [trackingDetails, setTrackingDetails] =
    useState<PassengerRideDetails | null>(null);
  const [rideTimeline, setRideTimeline] = useState<RideHistoryEntry[]>([]);
  const [zoneError, setZoneError] = useState("");
  const [ridesError, setRidesError] = useState("");
  const [trackingError, setTrackingError] = useState("");
  const [cancellationError, setCancellationError] = useState("");
  const [estimateError, setEstimateError] = useState("");
  const [requestError, setRequestError] = useState("");
  const [isLoadingZones, setIsLoadingZones] = useState(true);
  const [isLoadingRides, setIsLoadingRides] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isConfirmingCancellation, setIsConfirmingCancellation] =
    useState(false);
  const [isEstimating, setIsEstimating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [cancelledRide, setCancelledRide] = useState<PassengerRide | null>(null);
  const [isWalletUnavailable, setIsWalletUnavailable] = useState(false);
  const quoteSequence = useRef(0);

  // Fall back to cash if the wallet turns out to be unusable, so the form is
  // never left on a payment method we know cannot work.
  function handleWalletUnavailableChange(unavailable: boolean) {
    setIsWalletUnavailable(unavailable);
    if (unavailable) setPaymentMethod("CASH");
  }

  useEffect(() => {
    let isCurrent = true;

    getZones()
      .then((availableZones) => {
        if (isCurrent) setZones(availableZones);
      })
      .catch((error: unknown) => {
        if (isCurrent) {
          setZoneError(errorText(error, "Could not load Dhaka areas."));
        }
      })
      .finally(() => {
        if (isCurrent) setIsLoadingZones(false);
      });

    return () => {
      isCurrent = false;
    };
  }, []);

  useEffect(() => {
    let isCurrent = true;

    getMyRideRequests(token)
      .then((rides) => {
        if (isCurrent) setPassengerRides(rides);
      })
      .catch((error: unknown) => {
        if (isCurrent) {
          setRidesError(errorText(error, "Could not load your ride requests."));
        }
      })
      .finally(() => {
        if (isCurrent) setIsLoadingRides(false);
      });

    return () => {
      isCurrent = false;
    };
  }, [token]);

  const routeIsValid =
    originZoneId !== "" &&
    destinationZoneId !== "" &&
    originZoneId !== destinationZoneId;
  const currentQuoteIsValid =
    fareEstimate !== null &&
    quotedSelection?.originZoneId === originZoneId &&
    quotedSelection.destinationZoneId === destinationZoneId &&
    quotedSelection.seatsRequested === seatsRequested;
  const activeRide = passengerRides.find((item) =>
    ACTIVE_RIDE_STATUSES.includes(item.status),
  );

  useEffect(() => {
    if (!activeRide) return;

    let isCurrent = true;

    loadRideTracking(token, activeRide.id)
      .then(([details, timeline]) => {
        if (!isCurrent) return;
        setTrackingDetails(details);
        setRideTimeline(timeline);
      })
      .catch((error: unknown) => {
        if (isCurrent) {
          setTrackingError(errorText(error, "Could not load ride activity."));
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [activeRide, token]);

  function clearQuote() {
    quoteSequence.current += 1;
    setFareEstimate(null);
    setQuotedSelection(null);
    setEstimateError("");
    setIsEstimating(false);
  }

  async function handleEstimate() {
    if (!routeIsValid) return;

    const selection: QuoteSelection = {
      originZoneId,
      destinationZoneId,
      seatsRequested,
    };
    const sequence = ++quoteSequence.current;
    setIsEstimating(true);
    setEstimateError("");
    setFareEstimate(null);
    setQuotedSelection(null);

    try {
      const estimate = await estimateRideFare(
        token,
        selection.originZoneId,
        selection.destinationZoneId,
        selection.seatsRequested,
      );

      if (quoteSequence.current === sequence) {
        setFareEstimate(estimate);
        setQuotedSelection(selection);
      }
    } catch (error) {
      if (quoteSequence.current === sequence) {
        setEstimateError(errorText(error, "Could not estimate this fare."));
      }
    } finally {
      if (quoteSequence.current === sequence) setIsEstimating(false);
    }
  }

  async function handleRequestRide() {
    if (!currentQuoteIsValid) return;

    setIsSubmitting(true);
    setRequestError("");

    try {
      const createdRide = await createRideRequest(token, {
        originZoneId,
        destinationZoneId,
        seatsRequested,
        paymentMethod,
      });
      setRide(createdRide);
    } catch (error) {
      setRequestError(errorText(error, "Could not submit your ride request."));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleRefreshRide() {
    if (!activeRide) return;

    setIsRefreshing(true);
    setTrackingError("");

    try {
      const [rides, [details, timeline]] = await Promise.all([
        getMyRideRequests(token),
        loadRideTracking(token, activeRide.id),
      ]);
      setPassengerRides(rides);
      setTrackingDetails(details);
      setRideTimeline(timeline);
    } catch (error) {
      setTrackingError(errorText(error, "Could not refresh your ride status."));
    } finally {
      setIsRefreshing(false);
    }
  }

  async function handleViewCreatedRide() {
    setRide(null);
    setIsLoadingRides(true);
    setRidesError("");

    try {
      setPassengerRides(await getMyRideRequests(token));
    } catch (error) {
      setRidesError(errorText(error, "Could not load your ride request."));
    } finally {
      setIsLoadingRides(false);
    }
  }

  async function handleCancelRide() {
    if (
      !activeRide ||
      !CANCELLABLE_RIDE_STATUSES.includes(activeRide.status)
    ) {
      return;
    }

    setIsCancelling(true);
    setCancellationError("");

    try {
      const cancelled = await cancelRideRequest(token, activeRide.id);
      setPassengerRides((rides) =>
        rides.map((item) =>
          item.id === cancelled.id ? { ...item, ...cancelled } : item,
        ),
      );
      setIsConfirmingCancellation(false);
      setCancelledRide(cancelled);
    } catch (error) {
      setCancellationError(
        errorText(
          error,
          "Could not cancel this ride. Refresh its status and try again.",
        ),
      );
      setIsConfirmingCancellation(false);
    } finally {
      setIsCancelling(false);
    }
  }

  if (ride) {
    return (
      <section
        className="ride-content"
        aria-labelledby="request-confirmed-heading"
      >
        <div className="ride-success-mark" aria-hidden="true">
          OK
        </div>
        <p className="eyebrow">REQUEST SENT</p>
        <h1 id="request-confirmed-heading">Your ride is in the queue.</h1>
        <p className="ride-intro">
          We have your request, {passengerName}. A driver has not accepted it
          yet.
        </p>
        <div className="ride-confirmation">
          <div>
            <span className="ride-detail-label">ROUTE</span>
            <strong>
              {ride.originZone.name} <i /> {ride.destinationZone.name}
            </strong>
          </div>
          <div>
            <span className="ride-detail-label">STATUS</span>
            <strong className="status-requested">REQUESTED</strong>
          </div>
          <div>
            <span className="ride-detail-label">SEATS</span>
            <strong>{ride.seatsRequested}</strong>
          </div>
          <div>
            <span className="ride-detail-label">PAYMENT</span>
            <strong>
              {ride.paymentMethod === "CASH" ? "Cash" : "TeslaPay wallet"}
            </strong>
          </div>
          <div className="confirmation-fare">
            <span className="ride-detail-label">ESTIMATED FARE</span>
            <strong>{formatMoney(ride.estimatedFare)}</strong>
          </div>
        </div>
        <p className="ride-note">
          Your fare is estimated before pooling. A shared ride may cost less
          depending on how many seats are occupied.
        </p>
        <button
          className="request-button"
          type="button"
          onClick={handleViewCreatedRide}
        >
          Track this request
          <span aria-hidden="true">-&gt;</span>
        </button>
      </section>
    );
  }

  if (cancelledRide) {
    return (
      <section
        className="ride-content"
        aria-labelledby="ride-cancelled-heading"
      >
        <div className="ride-success-mark" aria-hidden="true">OK</div>
        <p className="eyebrow">REQUEST CANCELLED</p>
        <h1 id="ride-cancelled-heading">Your request was cancelled.</h1>
        <p className="ride-intro">
          {cancelledRide.originZone.name} to {cancelledRide.destinationZone.name}
        </p>
        <button
          className="estimate-button"
          type="button"
          onClick={() => setCancelledRide(null)}
        >
          Request another ride
        </button>
      </section>
    );
  }

  if (isLoadingRides) {
    return (
      <section className="ride-content" aria-live="polite">
        <div className="ride-loading">Checking your active ride...</div>
      </section>
    );
  }

  if (ridesError) {
    return (
      <section className="ride-content" aria-labelledby="rides-error-heading">
        <p className="eyebrow">PASSENGER / YOUR RIDES</p>
        <h1 id="rides-error-heading">Your ride list is unavailable.</h1>
        <p className="ride-intro" role="alert">
          {ridesError}
        </p>
        <button
          className="estimate-button"
          type="button"
          onClick={() => window.location.reload()}
        >
          Reload
        </button>
      </section>
    );
  }

  if (activeRide) {
    const trackingMatchesRide = trackingDetails?.id === activeRide.id;

    return (
      <section className="ride-content" aria-labelledby="active-ride-heading">
        <p className="eyebrow">PASSENGER / ACTIVE RIDE</p>
        <h1 id="active-ride-heading">Your request is underway.</h1>
        <p className="ride-intro">
          We found your existing ride request. Complete it before requesting
          another ride.
        </p>
        <div className="active-ride-summary">
          <div>
            <span className="ride-detail-label">ROUTE</span>
            <strong>
              {activeRide.originZone.name} to {activeRide.destinationZone.name}
            </strong>
          </div>
          <div>
            <span className="ride-detail-label">STATUS</span>
            <strong className="status-requested">
              {activeRide.status.replaceAll("_", " ")}
            </strong>
          </div>
          <div>
            <span className="ride-detail-label">SEATS</span>
            <strong>{activeRide.seatsRequested}</strong>
          </div>
          <div>
            <span className="ride-detail-label">PAYMENT</span>
            <strong>
              {activeRide.paymentMethod === "CASH" ? "Cash" : "TeslaPay wallet"}
            </strong>
          </div>
        </div>
        <div className="ride-tracking-section">
          <div className="tracking-heading">
            <div>
              <p className="eyebrow">STATUS HISTORY</p>
              <h2>Ride activity</h2>
            </div>
            <button
              className="refresh-status-button"
              type="button"
              onClick={handleRefreshRide}
              disabled={isRefreshing}
            >
              {isRefreshing ? "Refreshing..." : "Refresh status"}
            </button>
          </div>

          {trackingError && (
            <p className="ride-inline-error" role="alert">{trackingError}</p>
          )}

          {!trackingMatchesRide && !trackingError && (
            <div className="ride-loading" aria-live="polite">
              Loading ride activity...
            </div>
          )}

          {trackingMatchesRide && trackingDetails.pool && (
            <div className="assigned-vehicle">
              <span className="ride-detail-label">DRIVER / VEHICLE</span>
              <strong>
                {trackingDetails.pool.driver.name} / {trackingDetails.pool.vehicle.name}
              </strong>
              {trackingDetails.pool.vehicle.plateNumber && (
                <span>{trackingDetails.pool.vehicle.plateNumber}</span>
              )}
            </div>
          )}

          {trackingMatchesRide && rideTimeline.length === 0 && (
            <p className="ride-empty">No status history is available yet.</p>
          )}

          {trackingMatchesRide && rideTimeline.length > 0 && (
            <ol className="ride-timeline">
              {rideTimeline.map((entry, index) => (
                <li className="ride-timeline-entry" key={entry.id}>
                  <span
                    className={`timeline-marker${index === rideTimeline.length - 1 ? " timeline-marker-current" : ""}`}
                    aria-hidden="true"
                  />
                  <div className="timeline-entry-content">
                    <div className="timeline-entry-heading">
                      <strong>{entry.status.replaceAll("_", " ")}</strong>
                      <time dateTime={entry.createdAt}>
                        {new Intl.DateTimeFormat("en-BD", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        }).format(new Date(entry.createdAt))}
                      </time>
                    </div>
                    {entry.note && <p>{entry.note}</p>}
                  </div>
                </li>
              ))}
            </ol>
          )}

          {CANCELLABLE_RIDE_STATUSES.includes(activeRide.status) ? (
            isConfirmingCancellation ? (
              <div className="cancellation-confirmation" role="group" aria-label="Confirm ride cancellation">
                <div>
                  <strong>Cancel this ride request?</strong>
                  <p>This cannot be undone.</p>
                </div>
                <div className="cancellation-actions">
                  <button
                    className="confirm-cancel-button"
                    type="button"
                    onClick={handleCancelRide}
                    disabled={isCancelling}
                  >
                    {isCancelling ? "Cancelling..." : "Confirm cancellation"}
                  </button>
                  <button
                    className="keep-ride-button"
                    type="button"
                    onClick={() => setIsConfirmingCancellation(false)}
                    disabled={isCancelling}
                  >
                    Keep ride
                  </button>
                </div>
              </div>
            ) : (
              <button
                className="cancel-ride-button"
                type="button"
                onClick={() => {
                  setCancellationError("");
                  setIsConfirmingCancellation(true);
                }}
              >
                Cancel ride
              </button>
            )
          ) : (
            <p className="ride-note">
              This trip has started; cancellation is no longer available.
            </p>
          )}

          {cancellationError && (
            <p className="ride-inline-error" role="alert">
              {cancellationError}
            </p>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="ride-content" aria-labelledby="ride-heading">
      <div className="ride-heading-row">
        <div>
          <p className="eyebrow">PASSENGER / NEW REQUEST</p>
          <h1 id="ride-heading">Where are you going?</h1>
          <p className="ride-intro">
            Choose two Dhaka areas. We will show your fare before you request.
          </p>
        </div>
        <span className="ride-step-mark">01 / RIDE</span>
      </div>

      <WalletPanel
        token={token}
        onUnavailableChange={handleWalletUnavailableChange}
      />

      {isLoadingZones ? (
        <div className="ride-loading" aria-live="polite">
          Loading Dhaka areas...
        </div>
      ) : zoneError ? (
        <div className="ride-error" role="alert">
          <span>{zoneError}</span>
          <button type="button" onClick={() => window.location.reload()}>
            Reload
          </button>
        </div>
      ) : zones.length === 0 ? (
        <div className="ride-empty" role="status">
          No active Dhaka areas are available right now.
        </div>
      ) : (
        <>
          <div className="route-picker">
            <div className="route-picker-line" aria-hidden="true">
              <i />
              <i />
            </div>
            <div className="route-field">
              <label htmlFor="origin-zone">Pickup area</label>
              <select
                id="origin-zone"
                value={originZoneId}
                onChange={(event) => {
                  setOriginZoneId(event.target.value);
                  clearQuote();
                  setRequestError("");
                }}
              >
                <option value="">Choose pickup</option>
                {zones.map((zone) => (
                  <option key={zone.id} value={zone.id}>
                    {zone.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="route-field">
              <label htmlFor="destination-zone">Destination area</label>
              <select
                id="destination-zone"
                value={destinationZoneId}
                onChange={(event) => {
                  setDestinationZoneId(event.target.value);
                  clearQuote();
                  setRequestError("");
                }}
              >
                <option value="">Choose destination</option>
                {zones.map((zone) => (
                  <option key={zone.id} value={zone.id}>
                    {zone.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {originZoneId !== "" && originZoneId === destinationZoneId && (
            <p className="ride-inline-error" role="alert">
              Pickup and destination must be different areas.
            </p>
          )}

          <div className="ride-options-row">
            <div className="ride-option">
              <label htmlFor="seats-requested">Passenger seats</label>
              <select
                id="seats-requested"
                value={seatsRequested}
                onChange={(event) => {
                  setSeatsRequested(Number(event.target.value));
                  clearQuote();
                  setRequestError("");
                }}
              >
                {[1, 2, 3].map((seats) => (
                  <option key={seats} value={seats}>
                    {seats}
                  </option>
                ))}
              </select>
            </div>
            <div className="ride-option payment-option">
              <span>Payment method</span>
              <div
                className="payment-switch"
                role="group"
                aria-label="Payment method"
              >
                <button
                  type="button"
                  aria-pressed={paymentMethod === "CASH"}
                  className={paymentMethod === "CASH" ? "payment-active" : ""}
                  onClick={() => setPaymentMethod("CASH")}
                >
                  Cash
                </button>
                <button
                  type="button"
                  aria-pressed={paymentMethod === "WALLET"}
                  className={paymentMethod === "WALLET" ? "payment-active" : ""}
                  onClick={() => setPaymentMethod("WALLET")}
                  disabled={isWalletUnavailable}
                  title={
                    isWalletUnavailable
                      ? "Your wallet is unavailable, so TeslaPay cannot be used for this ride."
                      : undefined
                  }
                >
                  TeslaPay
                </button>
              </div>
              {isWalletUnavailable && (
                <p className="ride-inline-error">
                  TeslaPay is unavailable right now. This ride will be paid in
                  cash.
                </p>
              )}
            </div>
          </div>

          <div className="ride-actions">
            <button
              className="estimate-button"
              type="button"
              onClick={handleEstimate}
              disabled={!routeIsValid || isEstimating}
            >
              {isEstimating ? "Calculating..." : "Estimate fare"}
            </button>
            {estimateError && (
              <p className="ride-inline-error" role="alert">
                {estimateError}
              </p>
            )}
          </div>

          {fareEstimate && currentQuoteIsValid && (
            <div className="fare-preview" aria-live="polite">
              <div className="fare-preview-heading">
                <div>
                  <p className="eyebrow">FARE PREVIEW</p>
                  <h2>
                    Estimated for {seatsRequested}{" "}
                    {seatsRequested === 1 ? "seat" : "seats"}
                  </h2>
                </div>
                <span>{fareEstimate.solo.distanceKm} km est.</span>
              </div>
              <div className="fare-options">
                <FareOption label="Solo" fare={fareEstimate.solo} featured />
                <FareOption
                  label="2 seats occupied"
                  fare={fareEstimate.twoPassengerPool}
                />
                <FareOption
                  label="3 seats occupied"
                  fare={fareEstimate.threePassengerPool}
                />
              </div>
              <p className="fare-disclaimer">
                Estimates are for all selected seats. Shared fare depends on
                actual pool occupancy.
              </p>
              {requestError && (
                <p className="ride-inline-error" role="alert">
                  {requestError}
                </p>
              )}
              <button
                className="request-button"
                type="button"
                onClick={handleRequestRide}
                disabled={!currentQuoteIsValid || isSubmitting}
              >
                {isSubmitting ? "Sending request..." : "Request this ride"}
                <span aria-hidden="true">-&gt;</span>
              </button>
            </div>
          )}
        </>
      )}
      <RideHistoryList token={token} rides={passengerRides} />
    </section>
  );
}

function FareOption({
  label,
  fare,
  featured = false,
}: {
  label: string;
  fare: FareEstimate["solo"];
  featured?: boolean;
}) {
  return (
    <div className={`fare-option${featured ? " fare-option-featured" : ""}`}>
      <span>{label}</span>
      <strong>{formatMoney(fare.finalFare)}</strong>
      {fare.poolDiscountPercentage > 0 && (
        <small>{fare.poolDiscountPercentage}% pool discount</small>
      )}
      {fare.poolDiscountPercentage === 0 && <small>Standard estimate</small>}
    </div>
  );
}

function RideHistoryList({
  token,
  rides,
}: {
  token: string;
  rides: PassengerRide[];
}) {
  const historyRides = rides.filter(
    (ride) => ride.status === "COMPLETED" || ride.status === "CANCELLED",
  );
  const [expandedRideId, setExpandedRideId] = useState<string | null>(null);
  const [loadingRideId, setLoadingRideId] = useState<string | null>(null);
  const [loadedHistory, setLoadedHistory] = useState<{
    rideId: string;
    entries: RideHistoryEntry[];
    payment: RidePayment | null;
  } | null>(null);
  const [loadError, setLoadError] = useState<{
    rideId: string;
    message: string;
  } | null>(null);
  const requestSequence = useRef(0);

  async function toggleRideActivity(ride: PassengerRide) {
    if (expandedRideId === ride.id) {
      requestSequence.current += 1;
      setExpandedRideId(null);
      setLoadingRideId(null);
      return;
    }

    const sequence = ++requestSequence.current;
    setExpandedRideId(ride.id);
    setLoadingRideId(ride.id);
    setLoadError(null);

    try {
      const [entries, payment] = await Promise.all([
        getRideRequestHistory(token, ride.id),
        ride.status === "COMPLETED"
          ? getRidePayment(token, ride.id).catch((error: unknown) => {
              if (error instanceof ApiError && error.status === 404) return null;
              throw error;
            })
          : Promise.resolve(null),
      ]);

      if (requestSequence.current === sequence) {
        setLoadedHistory({ rideId: ride.id, entries, payment });
      }
    } catch (error) {
      if (requestSequence.current === sequence) {
        setLoadError({
          rideId: ride.id,
          message: errorText(error, "Could not load this ride's history."),
        });
      }
    } finally {
      if (requestSequence.current === sequence) setLoadingRideId(null);
    }
  }

  return (
    <section className="passenger-history" aria-labelledby="ride-history-heading">
      <div className="passenger-history-heading">
        <div>
          <p className="eyebrow">PASSENGER / PAST RIDES</p>
          <h2 id="ride-history-heading">Ride history</h2>
        </div>
        <span>{historyRides.length} rides</span>
      </div>

      {historyRides.length === 0 ? (
        <p className="history-empty">
          Completed and cancelled rides will appear here.
        </p>
      ) : (
        <ul className="passenger-history-list">
          {historyRides.map((ride) => {
            const isExpanded = expandedRideId === ride.id;
            const rideHistory =
              loadedHistory?.rideId === ride.id ? loadedHistory : null;
            const rideError = loadError?.rideId === ride.id ? loadError : null;

            return (
              <li className="history-ride" key={ride.id}>
                <button
                  className="history-ride-toggle"
                  type="button"
                  aria-expanded={isExpanded}
                  onClick={() => void toggleRideActivity(ride)}
                >
                  <span className="history-route">
                    <strong>
                      {ride.originZone.name} <i /> {ride.destinationZone.name}
                    </strong>
                    <small>
                      {new Intl.DateTimeFormat("en-BD", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      }).format(new Date(ride.requestedAt))}
                      {` / ${ride.seatsRequested} ${ride.seatsRequested === 1 ? "seat" : "seats"}`}
                    </small>
                  </span>
                  <span
                    className={`history-status history-status-${ride.status.toLowerCase()}`}
                  >
                    {ride.status.replaceAll("_", " ")}
                  </span>
                  <span className="history-toggle-label">
                    {isExpanded ? "Hide activity" : "View activity"}
                  </span>
                </button>

                {isExpanded && (
                  <div className="history-ride-details">
                    {loadingRideId === ride.id && (
                      <p className="history-loading" aria-live="polite">
                        Loading ride activity...
                      </p>
                    )}
                    {rideError && (
                      <p className="ride-inline-error" role="alert">
                        {rideError.message}
                      </p>
                    )}
                    {rideHistory && (
                      <>
                        <ol className="ride-timeline">
                          {rideHistory.entries.map((entry, index) => (
                            <li className="ride-timeline-entry" key={entry.id}>
                              <span
                                className={`timeline-marker${index === rideHistory.entries.length - 1 ? " timeline-marker-current" : ""}`}
                                aria-hidden="true"
                              />
                              <div className="timeline-entry-content">
                                <div className="timeline-entry-heading">
                                  <strong>{entry.status.replaceAll("_", " ")}</strong>
                                  <time dateTime={entry.createdAt}>
                                    {new Intl.DateTimeFormat("en-BD", {
                                      dateStyle: "medium",
                                      timeStyle: "short",
                                    }).format(new Date(entry.createdAt))}
                                  </time>
                                </div>
                                {entry.note && <p>{entry.note}</p>}
                              </div>
                            </li>
                          ))}
                        </ol>
                        {ride.status === "COMPLETED" && (
                          <p className="history-payment">
                            {rideHistory.payment ? (
                              <>
                                Final fare: {formatMoney(Number(rideHistory.payment.amount))}
                                {` / ${rideHistory.payment.method === "CASH" ? "Cash" : "TeslaPay"}`}
                                {` / ${rideHistory.payment.status}`}
                              </>
                            ) : (
                              "Final fare record is not available."
                            )}
                          </p>
                        )}
                        {ride.status === "CANCELLED" && (
                          <p className="history-payment">No payment was collected for this cancelled ride.</p>
                        )}
                      </>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
