import "dotenv/config";
import { defineConfig } from "vitest/config";

// ── Two suites, deliberately separated ───────────────────────────────────
//
//   unit         pure logic (fares, transition tables). No database, no
//                Docker, fast.
//   integration  database invariants (seat capacity, concurrency, access
//                control). Needs a real PostgreSQL, because the guarantee
//                being tested lives in Postgres' row locking rather than in
//                our JavaScript — mocking Prisma here would prove nothing.
//
// The integration suite is only registered when TEST_DATABASE_URL is set. If
// it isn't, we say so loudly rather than reporting a deceptively green run.
const projects: string[] = ["vitest.unit.config.ts"];

if (process.env.TEST_DATABASE_URL) {
  projects.push("vitest.integration.config.ts");
} else {
  console.warn(
    [
      "",
      "─────────────────────────────────────────────────────────────",
      " TEST_DATABASE_URL is not set — integration tests will be SKIPPED.",
      "",
      "   npm run test:db:up",
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
