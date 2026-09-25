// prisma/seed.ts
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, UserRole } from "../generated/prisma/client.js";

const connectionString = process.env["DATABASE_URL"] ?? "";
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("🌱 Starting seed...");

  // 1. Zones
  const zoneNames = [
    "Banani",
    "Gulshan 1",
    "Mohakhali",
    "Dhanmondi",
    "Mirpur",
    "Uttara",
  ];

  const zones = await Promise.all(
    zoneNames.map((name) =>
      prisma.zone.upsert({
        where: { name },
        update: {},
        create: { name },
      })
    )
  );
  console.log(`✅ Zones created: ${zones.map((z) => z.name).join(", ")}`);

  // 2. Users
  const jashim = await prisma.user.upsert({
    where: { phone: "01700000001" },
    update: {},
    create: {
      name: "Jashim",
      phone: "01700000001",
      email: "jashim@example.com",
      role: UserRole.DRIVER,
      password: "hashed_password_here", // replace with real hash before production
    },
  });

  const nusrat = await prisma.user.upsert({
    where: { phone: "01700000002" },
    update: {},
    create: {
      name: "Nusrat",
      phone: "01700000002",
      email: "nusrat@example.com",
      role: UserRole.PASSENGER,
    },
  });

  const rafiq = await prisma.user.upsert({
    where: { phone: "01700000003" },
    update: {},
    create: {
      name: "Rafiq",
      phone: "01700000003",
      email: "rafiq@example.com",
      role: UserRole.PASSENGER,
    },
  });

  await prisma.user.upsert({
    where: { phone: "01700000004" },
    update: {},
    create: {
      name: "Shirin",
      phone: "01700000004",
      email: "shirin@example.com",
      role: UserRole.PASSENGER,
    },
  });

  console.log("✅ Users created: Jashim (Driver), Nusrat, Rafiq, Shirin");

  // 3. Vehicle — Bullet, owned by Jashim (3 seats as per PRD)
  const bullet = await prisma.vehicle.upsert({
    where: { plateNumber: "DHAKA-BULLET-01" },
    update: {},
    create: {
      ownerId: jashim.id,
      name: "Bullet",
      model: "Battery-powered Tesla rickshaw",
      plateNumber: "DHAKA-BULLET-01",
      seatCapacity: 3,
    },
  });

  console.log(`✅ Vehicle created: ${bullet.name} (capacity: ${bullet.seatCapacity} seats)`);

  // Suppress unused variable warnings — variables kept for clarity
  void nusrat;
  void rafiq;

  console.log("🎉 Seed completed successfully!");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
