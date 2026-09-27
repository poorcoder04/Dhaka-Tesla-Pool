/**
 * PLACEHOLDER fare estimator — used only to show the passenger a number at
 * request time (PRD Section 3: "See estimated fare"). It is never persisted
 * to Payment. The real, documented fare model (Section 5:
 * passengerFare = baseFare + distanceCharge - poolDiscount, with a decided
 * money-storage strategy) lands in Step 7 and will REPLACE the body of this
 * function only — nothing that calls estimateFare() needs to change.
 *
 * Distances below are rough straight-line estimates between the seeded
 * Dhaka zones (Banani, Gulshan 1, Mohakhali, Dhanmondi, Mirpur, Uttara),
 * hand-picked just to make the stub non-constant. Not meant to be accurate.
 */

const BASE_FARE = 30; // taka
const RATE_PER_KM = 15; // taka/km
const DEFAULT_DISTANCE_KM = 6; // fallback if a zone pair isn't in the table below

// Keyed by "ZoneA|ZoneB" with names sorted alphabetically so lookup is
// direction-independent (Banani->Mirpur costs the same as Mirpur->Banani).
const ZONE_DISTANCE_KM: Record<string, number> = {
  "Banani|Gulshan 1": 2,
  "Banani|Mohakhali": 2,
  "Banani|Dhanmondi": 9,
  "Banani|Mirpur": 10,
  "Banani|Uttara": 12,
  "Gulshan 1|Mohakhali": 3,
  "Dhanmondi|Gulshan 1": 10,
  "Gulshan 1|Mirpur": 11,
  "Gulshan 1|Uttara": 14,
  "Dhanmondi|Mohakhali": 8,
  "Mirpur|Mohakhali": 9,
  "Mohakhali|Uttara": 11,
  "Dhanmondi|Mirpur": 7,
  "Dhanmondi|Uttara": 17,
  "Mirpur|Uttara": 10,
};

function distanceBetween(originZoneName: string, destinationZoneName: string): number {
  const key = [originZoneName, destinationZoneName].sort().join("|");
  return ZONE_DISTANCE_KM[key] ?? DEFAULT_DISTANCE_KM;
}

/**
 * Returns a rough fare estimate in taka, rounded to 2 decimal places.
 * Takes zone NAMES (not ids) so it has no dependency on the database layer.
 */
export function estimateFare(originZoneName: string, destinationZoneName: string): number {
  const distanceKm = distanceBetween(originZoneName, destinationZoneName);
  const fare = BASE_FARE + distanceKm * RATE_PER_KM;
  return Math.round(fare * 100) / 100;
}
