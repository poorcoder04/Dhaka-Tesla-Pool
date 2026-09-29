import { defineConfig } from "vitest/config";

/**
 * Pure logic: fare arithmetic and the state-transition tables. No database,
 * no Docker, fast enough to run on every save.
 */
export default defineConfig({
  test: {
    name: "unit",
    include: ["tests/*.test.ts"],
    environment: "node",
  },
});
