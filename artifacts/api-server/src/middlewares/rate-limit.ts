import type { Request, Response, NextFunction } from "express";

/**
 * Small dependency-free, in-memory, fixed-window rate limiter.
 *
 * This app is a single-instance LAN deployment, so a process-local map is
 * appropriate. If it is ever scaled horizontally this should move to Redis.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

export interface RateLimitOptions {
  /** Window size in milliseconds. */
  windowMs: number;
  /** Max requests allowed per key per window. */
  max: number;
  /** Message returned on 429. */
  message?: string;
  /** Optional custom key (defaults to socket IP). */
  keyGenerator?: (req: Request) => string;
}

export function clientIp(req: Request): string {
  const fwd = req.headers["x-forwarded-for"];
  const fwdStr = Array.isArray(fwd) ? fwd[0] : fwd;
  const raw =
    (typeof fwdStr === "string" ? fwdStr.split(",")[0]?.trim() : undefined) ||
    req.socket.remoteAddress ||
    "unknown";
  return raw.replace("::ffff:", "");
}

export function rateLimit(options: RateLimitOptions) {
  const { windowMs, max, message = "Too many requests. Please slow down and try again shortly." } = options;
  const buckets = new Map<string, Bucket>();

  // Periodically drop expired buckets so the map cannot grow unbounded.
  const sweeper = setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }
  }, Math.max(windowMs, 60_000));
  // Do not keep the event loop (or a test runner) alive just for the sweeper.
  if (typeof sweeper.unref === "function") sweeper.unref();

  return function rateLimitMiddleware(req: Request, res: Response, next: NextFunction) {
    const key = options.keyGenerator ? options.keyGenerator(req) : clientIp(req);
    const now = Date.now();
    let bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }

    bucket.count += 1;

    const remaining = Math.max(0, max - bucket.count);
    res.setHeader("X-RateLimit-Limit", String(max));
    res.setHeader("X-RateLimit-Remaining", String(remaining));
    res.setHeader("X-RateLimit-Reset", String(Math.ceil(bucket.resetAt / 1000)));

    if (bucket.count > max) {
      const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      res.setHeader("Retry-After", String(retryAfter));
      res.status(429).json({ error: "rate_limited", message });
      return;
    }

    next();
  };
}
