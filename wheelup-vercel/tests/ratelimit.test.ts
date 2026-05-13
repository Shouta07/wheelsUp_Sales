import { test } from "node:test";
import assert from "node:assert/strict";
import { _resetRateLimits, rateLimit } from "../api/_lib/ratelimit.ts";

test("rate limit: blocks beyond capacity", () => {
  _resetRateLimits();
  const opts = { capacity: 3, refillPerSec: 0.0001 };
  assert.equal(rateLimit("k", opts).ok, true);
  assert.equal(rateLimit("k", opts).ok, true);
  assert.equal(rateLimit("k", opts).ok, true);
  const r = rateLimit("k", opts);
  assert.equal(r.ok, false);
  assert.ok(r.retryAfterSec > 0);
});

test("rate limit: keys independent", () => {
  _resetRateLimits();
  const opts = { capacity: 1, refillPerSec: 0.0001 };
  assert.equal(rateLimit("a", opts).ok, true);
  assert.equal(rateLimit("b", opts).ok, true);
  assert.equal(rateLimit("a", opts).ok, false);
  assert.equal(rateLimit("b", opts).ok, false);
});
