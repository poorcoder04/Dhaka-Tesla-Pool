import "dotenv/config";
import { defineConfig } from "vitest/config";

// ── Two test projects, deliberately separated ────────────────────────────
//
// `unit`         pure logic (fares, transition tables). No database, no
//                docker, runs anywhere. Fast.
// `integration`  database invariants (seat capacity, concurrency, access
//                control). Needs a real PostgreSQL, because the guarantee
//                being tested lives in Postgres' row locking, not in our
//                JavaScript — mocking Prisma here would prove nothing.
//
// The integration project is only registered when TEST_DATABASE_URL is set.
// If it isn't, we say so loudly rather than reporting a deceptively green run.
const testDatabaseUrl = process.env.TEST_DATABASE_URL;

const projects: Record<string, unknown>[] = [
  {
    test: {
      name: "unit",
      // Top-level tests only: tests/*.test.ts
      include: ["tests/*.test.ts"],
      environment: "node",
    },
  },
];

if (testDatabaseUrl) {
  projects.push({
    test: {
      name: "integration",
      include: ["tests/integration/**/*.test.ts"],
      environment: "node",
      globalSetup: ["tests/setup/globalSetup.ts"],
      setupFiles: ["tests/setup/closeDb.ts"],
      // Tests share one throwaway database and truncate it between cases, so
      // files must not run concurrently.
      fileParallelism: false,
      // Concurrency tests wait on real row locks on purpose.
      testTimeout: 30_000,
      hookTimeout: 60_000,
      env: {
        NODE_ENV: "test",
        // The services read DATABASE_URL via src/config/env.ts at import time.
        DATABASE_URL: testDatabaseUrl,
      },
    },
  });
} else {
  console.warn(
    [
      "",
      "─────────────────────────────────────────────────────────────",
      " TEST_DATABASE_URL is not set — integration tests will be SKIPPED.",
      "",
      "   docker compose -f docker-compose.test.yml up -d",
      '   TEST_DATABASE_URL="postgresql://postgres:test_password_here@localhost:5434/tesla_pool_test_db"',
      "",
      " Add the second line to backend/.env to make this permanent.",
      "─────────────────────────────────────────────────────────────",
      "",
    ].join("\n"),
  );
}

export default defineConfig({
  test: { projects },
});
