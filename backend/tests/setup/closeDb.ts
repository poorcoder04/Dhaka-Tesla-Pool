import { afterAll } from "vitest";

import { prisma } from "../../src/lib/prisma.js";

// The Prisma adapter holds real TCP sockets to PostgreSQL. Without an
// explicit disconnect, a vitest worker can sit there waiting for connections
// to close instead of exiting. One disconnect per test file is safe: vitest
// gives every file its own module registry, so each file also gets its own
// client instance.
afterAll(async () => {
  await prisma.$disconnect();
});
