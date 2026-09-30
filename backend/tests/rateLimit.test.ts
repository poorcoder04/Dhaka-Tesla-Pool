import { afterAll, beforeAll, describe, expect, test } from "vitest";
import express from "express";
import type { Server } from "node:http";
import { loginLimiter, signupLimiter } from "../src/middleware/rateLimit.middleware.js";

/**
 * The rate limiter is security behaviour, so it is tested the way it runs:
 * a real Express app over a real socket. No supertest needed, and no new
 * dependency.
 *
 * The limiter's counters live in module-level state, so each test uses its
 * own client IP (via X-Forwarded-For, which only works because the app
 * trusts one proxy hop). Sharing an IP between tests would make them depend
 * on each other's request counts.
 */

let server: Server;
let baseUrl: string;

// A stand-in for the real login handler. `failing` decides whether the
// attempt "succeeds", which is what skipSuccessfulRequests keys off: the
// limiter decrements the counter when the response is not a 4xx/5xx.
let failing = true;

beforeAll(async () => {
  const app = express();
  // Same setting the real app uses, so the test exercises the real key path.
  app.set("trust proxy", 1);

  app.post("/login", loginLimiter, (_req, res) => {
    res.status(failing ? 401 : 200).json({ success: !failing });
  });
  app.post("/signup", signupLimiter, (_req, res) => {
    res.status(201).json({ success: true });
  });

  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("expected an inet address from server.address()");
  }
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
});

/** Each test gets a unique IP so the shared counter never leaks between them. */
let ipCounter = 0;
function freshIp(): string {
  ipCounter += 1;
  return `203.0.113.${ipCounter}`;
}

async function attempt(
  path: string,
  ip: string,
): Promise<{ status: number; body: unknown; headers: Headers }> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "X-Forwarded-For": ip },
  });
  const body = await response.json().catch(() => null);
  return { status: response.status, body, headers: response.headers };
}

describe("login rate limit", () => {
  test("allows the first 10 failed attempts, then returns 429", async () => {
    failing = true;
    const ip = freshIp();

    for (let i = 1; i <= 10; i += 1) {
      const result = await attempt("/login", ip);
      // The 401 comes from our stub handler, not the limiter — the point is
      // that the limiter is not interfering yet.
      expect(result.status, `attempt ${i} should not be rate limited`).toBe(401);
    }

    const blocked = await attempt("/login", ip);
    expect(blocked.status).toBe(429);
  });

  test("429 body matches the error envelope the frontend parses", async () => {
    // The frontend reads `error.message`. A bare string or a different shape
    // would render as the generic "The server could not complete your request."
    // and hide the fact that waiting is the fix.
    const ip = freshIp();
    for (let i = 0; i <= 10; i += 1) await attempt("/login", ip);

    const blocked = await attempt("/login", ip);
    expect(blocked.status).toBe(429);
    expect(blocked.body).toMatchObject({
      success: false,
      error: { message: expect.stringContaining("Too many attempts") },
    });
  });

  test("a successful login does not consume the budget", async () => {
    // Guards the case that actually bites in a demo: a reviewer signing in
    // as each of the four accounts, and an earlier mistyped password.
    failing = false;
    const ip = freshIp();

    for (let i = 0; i < 15; i += 1) {
      const result = await attempt("/login", ip);
      expect(result.status, `successful attempt ${i + 1} must not be limited`).toBe(200);
    }

    // Now prove the limiter is still armed for this IP, rather than having
    // been disabled by the successes above.
    failing = true;
    for (let i = 1; i <= 10; i += 1) await attempt("/login", ip);
    const blocked = await attempt("/login", ip);
    expect(blocked.status).toBe(429);
  });

  test("one abusive IP does not lock out a different IP", async () => {
    // This is the whole reason `app.set("trust proxy", 1)` exists. Without it
    // every request appears to come from the load balancer, they all share
    // one bucket, and one attacker locks out every legitimate user.
    const attacker = freshIp();
    const bystander = freshIp();

    for (let i = 0; i <= 10; i += 1) await attempt("/login", attacker);

    expect((await attempt("/login", attacker)).status).toBe(429);
    expect((await attempt("/login", bystander)).status).not.toBe(429);
  });

  test("a blocked response tells the client when to retry", async () => {
    const ip = freshIp();
    for (let i = 0; i <= 10; i += 1) await attempt("/login", ip);

    const blocked = await attempt("/login", ip);
    expect(blocked.headers.get("retry-after")).toBeTruthy();
  });
});

describe("signup rate limit", () => {
  test("is looser than login and does not block a burst of 10", async () => {
    // Signup is not a guessing attack, so a tight limit would only block
    // legitimate people registering.
    const ip = freshIp();
    for (let i = 0; i < 10; i += 1) {
      const result = await attempt("/signup", ip);
      expect(result.status).toBe(201);
    }
  });
});
