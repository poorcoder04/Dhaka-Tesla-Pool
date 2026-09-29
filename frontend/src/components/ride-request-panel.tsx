"use client";

import {
  createRideRequest,
  estimateRideFare,
  getZones,
  type FareEstimate,
  type PaymentMethod,
  type RideRequestResult,
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

function formatMoney(amount: number): string {
  return new Intl.NumberFormat("en-BD", {
    style: "currency",
    currency: "BDT",
    maximumFractionDigits: 2,
  }).format(amount);
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
  const [zoneError, setZoneError] = useState("");
  const [estimateError, setEstimateError] = useState("");
  const [requestError, setRequestError] = useState("");
  const [isLoadingZones, setIsLoadingZones] = useState(true);
  const [isEstimating, setIsEstimating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const quoteSequence = useRef(0);

  useEffect(() => {
    let isCurrent = true;

    getZones()
      .then((availableZones) => {
        if (isCurrent) setZones(availableZones);
      })
      .catch((error: unknown) => {
        if (isCurrent) {
          setZoneError(
            error instanceof Error
              ? error.message
              : "Could not load Dhaka areas.",
          );
        }
      })
      .finally(() => {
        if (isCurrent) setIsLoadingZones(false);
      });

    return () => {
      isCurrent = false;
    };
  }, []);

  const routeIsValid =
    originZoneId !== "" &&
    destinationZoneId !== "" &&
    originZoneId !== destinationZoneId;
  const currentQuoteIsValid =
    fareEstimate !== null &&
    quotedSelection?.originZoneId === originZoneId &&
    quotedSelection.destinationZoneId === destinationZoneId &&
    quotedSelection.seatsRequested === seatsRequested;

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
        setEstimateError(
          error instanceof Error
            ? error.message
            : "Could not estimate this fare.",
        );
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
      setRequestError(
        error instanceof Error
          ? error.message
          : "Could not submit your ride request.",
      );
    } finally {
      setIsSubmitting(false);
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
                >
                  TeslaPay
                </button>
              </div>
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
