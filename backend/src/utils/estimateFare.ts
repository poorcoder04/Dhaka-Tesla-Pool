import {
  DEFAULT_DISTANCE_KM,
  FARE_CONFIG,
  ZONE_DISTANCES_KM,
} from "../config/fareConfig.js";

export interface FareCalculationResult {
  baseFare: number;
  distanceKm: number;
  distanceCharge: number;
  subtotal: number;
  poolDiscountPercentage: number;
  poolDiscountAmount: number;
  finalFare: number;
}

export function getZoneDistance(
  originZoneName: string,
  destZoneName: string,
): number {
  if (originZoneName === destZoneName) return 0;
  return (
    ZONE_DISTANCES_KM[originZoneName]?.[destZoneName] ??
    ZONE_DISTANCES_KM[destZoneName]?.[originZoneName] ??
    DEFAULT_DISTANCE_KM
  );
}

export function getDiscountPercentage(totalSeatsOccupied: number): number {
  const tier = FARE_CONFIG.DISCOUNT_TIERS.find(
    (t) => totalSeatsOccupied >= t.minSeats && totalSeatsOccupied <= t.maxSeats,
  );
  return tier ? tier.discountPercentage : 30;
}

export function calculateFare(
  originZoneName: string,
  destZoneName: string,
  seatsBooked: number = 1,
  totalPoolSeatsOccupied: number = 1,
): FareCalculationResult {
  const distanceKm = getZoneDistance(originZoneName, destZoneName);

  const baseFarePoysha = FARE_CONFIG.BASE_FARE_TAKA * 100;
  const distanceRatePoysha = FARE_CONFIG.PER_KM_RATE_TAKA * 100;
  const distanceChargePoysha = distanceKm * distanceRatePoysha;

  const singleSeatSubtotalPoysha = baseFarePoysha + distanceChargePoysha;
  const passengerSubtotalPoysha = singleSeatSubtotalPoysha * seatsBooked;

  const discountPct = getDiscountPercentage(totalPoolSeatsOccupied);
  const discountAmountPoysha = Math.round(
    (passengerSubtotalPoysha * discountPct) / 100,
  );
  const finalFarePoysha = passengerSubtotalPoysha - discountAmountPoysha;

  return {
    baseFare: (baseFarePoysha * seatsBooked) / 100,
    distanceKm,
    distanceCharge: (distanceChargePoysha * seatsBooked) / 100,
    subtotal: passengerSubtotalPoysha / 100,
    poolDiscountPercentage: discountPct,
    poolDiscountAmount: discountAmountPoysha / 100,
    finalFare: finalFarePoysha / 100,
  };
}

export function estimateFare(
  originZoneName: string,
  destinationZoneName: string,
): number {
  const result = calculateFare(originZoneName, destinationZoneName, 1, 1);
  return Number(result.finalFare.toFixed(2));
}
