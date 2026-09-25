import "dotenv/config";
import express from "express";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";

// ── Prisma Client (Prisma 7 driver-adapter pattern) ────────────────────────
const connectionString = process.env["DATABASE_URL"] ?? "";
const adapter = new PrismaPg({ connectionString });
export const prisma = new PrismaClient({ adapter });

// ── Express App ────────────────────────────────────────────────────────────
const app = express();
const PORT = Number(process.env["PORT"] ?? 5000);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Health check (used by Docker Compose healthcheck) ──────────────────────
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ── Root ───────────────────────────────────────────────────────────────────
app.get("/", (_req, res) => {
  res.json({ message: "Dhaka Tesla Pool API", version: "1.0.0" });
});

// ── Start ──────────────────────────────────────────────────────────────────
async function start(): Promise<void> {
  try {
    await prisma.$connect();
    console.log("✅ Database connected");

    app.listen(PORT, "0.0.0.0", () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("❌ Failed to start server:", error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on("SIGINT", async () => {
  await prisma.$disconnect();
  console.log("👋 Server shut down");
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await prisma.$disconnect();
  process.exit(0);
});

await start();
