import express from "express";
import { env } from "./config/env.js";
import { prisma } from "./lib/prisma.js";
import { requestLogger } from "./middleware/requestLogger.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";

//  Express App 
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(requestLogger);

//  Health check (used by Docker Compose healthcheck) 
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Root 
app.get("/", (_req, res) => {
  res.json({ message: "Dhaka Tesla Pool API", version: "1.0.0" });
});

// TODO (Step 2+): mount feature routers here, e.g.
// app.use("/api/auth", authRouter);
// app.use("/api/vehicles", vehicleRouter);
// app.use("/api/rides", rideRequestRouter);

// 404 + centralized error handling — must be registered LAST 
app.use(notFoundHandler);
app.use(errorHandler);

//  Start 
async function start(): Promise<void> {
  try {
    await prisma.$connect();
    console.log("✅ Database connected");

    app.listen(env.PORT, "0.0.0.0", () => {
      console.log(`🚀 Server running on http://localhost:${env.PORT} [${env.NODE_ENV}]`);
    });
  } catch (error) {
    console.error("❌ Failed to start server:", error);
    process.exit(1);
  }
}

// ── Graceful shutdown 
async function shutdown(signal: string): Promise<void> {
  console.log(`\n👋 Received ${signal}, shutting down gracefully...`);
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

await start();

export { app };
