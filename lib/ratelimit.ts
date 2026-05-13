// In-memory token bucket rate limiter. Keyed by (route, identifier).
//
// Single-instance only — fine for Vercel cron usage where 1 lambda runs at a
// time, but if traffic scales to multiple concurrent serverless instances
// each instance enforces its own bucket. For a stricter cap, swap this for
// Upstash/Vercel KV.

interface Bucket {
  tokens: number;
  updatedAt: number;
}

const buckets = new Map<string, Bucket>();

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfterSec: number;
}

export interface RateLimitOptions {
  // Maximum tokens (burst).
  capacity: number;
  // Tokens refilled per second.
  refillPerSec: number;
}

export function rateLimit(key: string, opts: RateLimitOptions): RateLimitResult {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b) {
    b = { tokens: opts.capacity, updatedAt: now };
    buckets.set(key, b);
  } else {
    const elapsedSec = (now - b.updatedAt) / 1000;
    b.tokens = Math.min(opts.capacity, b.tokens + elapsedSec * opts.refillPerSec);
    b.updatedAt = now;
  }
  if (b.tokens >= 1) {
    b.tokens -= 1;
    return { ok: true, remaining: Math.floor(b.tokens), retryAfterSec: 0 };
  }
  const need = 1 - b.tokens;
  const retryAfterSec = Math.ceil(need / opts.refillPerSec);
  return { ok: false, remaining: 0, retryAfterSec };
}

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") || "unknown";
}

// Reusable presets. The LLM-calling endpoints are tighter because each call
// has dollar-denominated cost.
export const LLM_LIMIT: RateLimitOptions = { capacity: 4, refillPerSec: 4 / 60 };
export const READ_LIMIT: RateLimitOptions = { capacity: 30, refillPerSec: 30 / 60 };
export const WRITE_LIMIT: RateLimitOptions = { capacity: 20, refillPerSec: 20 / 60 };

// Test hook.
export function _resetRateLimits(): void {
  buckets.clear();
}
