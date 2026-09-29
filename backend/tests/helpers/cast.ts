import { UserRole } from "../../generated/prisma/client.js";
import { prisma } from "../../src/lib/prisma.js";

/**
 * The PRD's cast (Sections 1, 15 and 18). The brief is explicit that seed
 * data, tests and the demo should all use the same named people rather than
 * user1/driver1 placeholders, so the tests build the cast from scratch every
 * time instead of reading the seed script's rows.
 *
 *   Jashim  — driver, owns "Bullet", a 3-seat Tesla
 *   Nusrat  — passenger, Banani -> Mohakhali
 *   Rafiq   — passenger, Banani -> Gulshan 1
 *   Shirin  — passenger, grabs the last seat late
 *   Nafisa  — a bystander passenger, only used to prove that one passenger
 *             cannot read or touch another passenger's ride
 */
export interface Cast {
  jashim: { id: string; name: string };
  bullet: { id: string; name: string; seatCapacity: number };
  nusrat: { id: string };
  rafiq: { id: string };
  shirin: { id: string };
  nafisa: { id: string };
  zones: {
    banani: string;
    gulshan1: string;
    mohakhali: string;
    dhanmondi: string;
  };
}

let phoneCounter = 0;
function uniquePhone() {
  phoneCounter += 1;
  return `017${String(phoneCounter).padStart(8, "0")}`;
}

export async function createCast(): Promise<Cast> {
  const [banani, gulshan1, mohakhali, dhanmondi] = await Promise.all(
    ["Banani", "Gulshan 1", "Mohakhali", "Dhanmondi"].map((name) =>
      prisma.zone.create({ data: { name } }),
    ),
  );

  const jashim = await prisma.user.create({
    data: {
      name: "Jashim",
      phone: uniquePhone(),
      role: UserRole.DRIVER,
      // Drivers accept rides only while online (PRD driver column).
      isOnline: true,
    },
  });

  const bullet = await prisma.vehicle.create({
    data: {
      ownerId: jashim.id,
      name: "Bullet",
      model: "Model 3-ish",
      plateNumber: "DHAKA-TESLA-1",
      seatCapacity: 3,
    },
  });

  const passengers = await Promise.all(
    ["Nusrat", "Rafiq", "Shirin", "Nafisa"].map((name) =>
      prisma.user.create({
        data: { name, phone: uniquePhone(), role: UserRole.PASSENGER },
      }),
    ),
  );

  const [nusrat, rafiq, shirin, nafisa] = passengers;

  return {
    jashim,
    bullet,
    nusrat,
    rafiq,
    shirin,
    nafisa,
    zones: {
      banani: banani.id,
      gulshan1: gulshan1.id,
      mohakhali: mohakhali.id,
      dhanmondi: dhanmondi.id,
    },
  };
}

/** Creates a ride request through the real service, so validation and the
 *  "one active request per passenger" rule are exercised, not bypassed. */
export async function bookRide(
  passengerId: string,
  originZoneId: string,
  destinationZoneId: string,
  seatsRequested = 1,
) {
  const { createRideRequest } = await import("../../src/services/rideRequest.service.js");

  return createRideRequest(passengerId, {
    originZoneId,
    destinationZoneId,
    seatsRequested,
    paymentMethod: "CASH",
  });
}

/** Extra unnamed passengers, for the repeated concurrency stress loop. */
export async function createPassenger(name: string) {
  return prisma.user.create({
    data: { name, phone: uniquePhone(), role: UserRole.PASSENGER },
  });
}
