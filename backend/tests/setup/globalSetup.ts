import { execSync } from "node:child_process";
import type { TestProject } from "vitest/node";

/**
 * Runs once before the integration project.
 *
 * 1. Refuses to run if the configuration is unusable or dangerous.
 * 2. Brings the test database up to the current schema.
 *
 * Deliberately synchronous: nothing else may touch the database until the
 * schema is known to be correct.
 */
export async function setup(project: TestProject) {
  const testDatabaseUrl = process.env.TEST_DATABASE_URL;
  const devDatabaseUrl = process.env.DATABASE_URL;

  if (!testDatabaseUrl) {
    throw new Error(
      "TEST_DATABASE_URL is not set. Start the test database with " +
        "`docker compose -f docker-compose.test.yml up -d` and point " +
        "TEST_DATABASE_URL at it.",
    );
  }

  // These tests TRUNCATE every table between cases. Refuse to point them at
  // a database that is obviously the development one.
  if (devDatabaseUrl && databaseName(testDatabaseUrl) === databaseName(devDatabaseUrl)) {
    throw new Error(
      `TEST_DATABASE_URL and DATABASE_URL both name the database ` +
        `"${databaseName(testDatabaseUrl)}". The integration tests delete all ` +
        `rows between cases, so they must never run against your development ` +
        `data. Use the docker-compose.test.yml database.`,
    );
  }

  execSync("npx prisma migrate deploy", {
    env: { ...process.env, DATABASE_URL: testDatabaseUrl },
    stdio: "inherit",
    shell: true,
  });
}

export async function teardown() {
  // No cleanup needed: the whole point of the test database is that it is
  // disposable. It is torn down with `docker compose ... down -v`.
}

function databaseName(connectionString: string): string {
  try {
    const url = new URL(connectionString);
    return url.pathname.replace(/^\//, "") || "";
  } catch {
    return connectionString;
  }
}
