import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import type { Request } from "express";

/**
 * Rate limiting for the auth endpoints.
 *
 * Without this, `/api/auth/login` is an unlimited oracle for password
 * guessing. Passwords are bcrypt-hashed, which makes each attempt slow
 * enough to be a real defence on its own, but "slow" is not a limit: an
 * attacker with time can still make millions of attempts, and a public
 * deployment makes that someone else's server.
 *
 * In-memory store, not Redis. Counters live in this process, which is
 * correct for the single instance a free-tier deployment runs. If this is
 * ever scaled horizontally the limits stop being global and each instance
 * would grant its own budget — that is the point at which a shared store
 * becomes worth its cost. See docs/architecture.md for why no shared
 * cache exists today.
 */

// Behind a proxy or load balancer, every request appears to come from the
// proxy, so without this the whole internet shares one bucket and the first
// unlucky user locks everyone else out.
function clientKey(req: Request): string {
  // ipKeyGenerator normalises IPv6 to a /64 subnet. A single IPv6 host
  // typically owns a whole /64, so keying on the full address would let one
  // machine rotate through billions of addresses for free.
  return ipKeyGenerator(req.ip ?? "unknown");
}

/**
 * Response body in the same shape as the centralized error handler, because
 * the frontend reads `error.message` from it. A bare string here would show
 * up as "The server could not complete your request." and hide the fact
 * that the user only needs to wait.
 */
function tooManyRequests(_req: Request, seconds: number) {
  return {
    success: false,
    error: {
      message: `Too many attempts. Please try again in ${seconds} seconds.`,
    },
  };
}

// Login is the endpoint worth defending: guessing one password repeatedly is
// the attack, and the demo accounts share a password, so a rate limit here
// is what stops one script from testing that password across every account.
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: clientKey,
  // Only failed attempts should cost the user their budget. A legitimate user
  // mistyping twice and then succeeding has not done anything worth throttling,
  // and counting successes would lock out anyone who logs in repeatedly —
  // which a reviewer switching between the four demo accounts will do.
  skipSuccessfulRequests: true,
  handler: (req, res) => {
    const retryAfter = Math.ceil(Number(res.getHeader("Retry-After") ?? 900));
    res.status(429).json(tooManyRequests(req, retryAfter));
  },
});

// Signup is limited more loosely: it is cheaper to abuse (it creates rows) but
// creating an account is not a guessing attack, so a tighter limit would only
// block legitimate people.
export const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: clientKey,
  handler: (req, res) => {
    const retryAfter = Math.ceil(Number(res.getHeader("Retry-After") ?? 3600));
    res.status(429).json(tooManyRequests(req, retryAfter));
  },
});
