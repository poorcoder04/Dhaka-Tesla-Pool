export const FARE_CONFIG = {
  BASE_FARE_TAKA: 30,
  PER_KM_RATE_TAKA: 15,
  DISCOUNT_TIERS: [
    { minSeats: 1, maxSeats: 1, discountPercentage: 0 },
    { minSeats: 2, maxSeats: 2, discountPercentage: 20 },
    { minSeats: 3, maxSeats: Infinity, discountPercentage: 30 },
  ],
};

export const ZONE_DISTANCES_KM: Record<string, Record<string, number>> = {
  Banani: {
    Mohakhali: 2,
    "Gulshan 1": 3,
    Uttara: 10,
    Mirpur: 8,
    Dhanmondi: 9,
    Farmgate: 6,
    Bashundhara: 5,
  },
  Mohakhali: {
    Banani: 2,
    "Gulshan 1": 2,
    Farmgate: 4,
  },
  "Gulshan 1": {
    Banani: 3,
    Mohakhali: 2,
    Bashundhara: 4,
  },
};

export const DEFAULT_DISTANCE_KM = 5;
