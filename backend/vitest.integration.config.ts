import { defineConfig } from "vitest/config";

/**
 * Database invariants: seat capacity, the concurrent seat-claim race,
 * cross-user access control and cancellation rules.
 *
 * These tests share one throwaway PostgreSQL and TRUNCATE every table between
 * cases, so they must run strictly one file at a time in a single worker.
 * Running them in parallel makes one file reset the database out from under
 * another, which surfaces as unique-constraint errors that have nothing to do
 * with the code under test — so the serialisation below is load-bearing, not
 * a performance tweak.
 */
export default defineConfig({
  test: {
    name: "integration",
    include: ["tests/integration/**/*.test.ts"],
    environment: "node",

    globalSetup: ["tests/setup/globalSetup.ts"],
    setupFiles: ["tests/setup/closeDb.ts"],

    fileParallelism: false,
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
    maxWorkers: 1,
    minWorkers: 1,

    // Concurrency tests deliberately wait on real row locks.
    testTimeout: 30_000,
    hookTimeout: 60_000,

    // src/config/env.ts reads DATABASE_URL at import time, so it has to be
    // pointed at the throwaway database before any service module loads.
    // globalSetup refuses to start if this is the same database as dev.
    env: {
      NODE_ENV: "test",
      DATABASE_URL: process.env.TEST_DATABASE_URL,
    },
  },
});
