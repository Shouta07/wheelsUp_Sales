// Per-(route, identifier) token bucket. Single-instance only; OK for low
// traffic and a 5-person team.

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
  capacity: number;
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

import type { VercelRequest } from "@vercel/node";
export function clientIp(req: VercelRequest): string {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string") return fwd.split(",")[0]!.trim();
  if (Array.isArray(fwd) && fwd.length > 0) return fwd[0]!.split(",")[0]!.trim();
  const real = req.headers["x-real-ip"];
  if (typeof real === "string") return real;
  return "unknown";
}

// Each Gemini call is dollar-denominated; keep the LLM bucket tight.
export const LLM_LIMIT: RateLimitOptions = { capacity: 4, refillPerSec: 4 / 60 };
export const READ_LIMIT: RateLimitOptions = { capacity: 60, refillPerSec: 60 / 60 };
export const WRITE_LIMIT: RateLimitOptions = { capacity: 20, refillPerSec: 20 / 60 };

export function _resetRateLimits(): void {
  buckets.clear();
}
