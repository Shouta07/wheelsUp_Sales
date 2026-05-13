import { test } from "node:test";
import assert from "node:assert/strict";
import { checkAuth } from "../lib/auth.ts";

const STRONG_SECRET = "a-very-long-and-strong-secret-key-xyz";

function req(opts: { auth?: string; query?: string } = {}): Request {
  const url = opts.query ? `https://example.com/api/x?secret=${opts.query}` : "https://example.com/api/x";
  const headers: Record<string, string> = {};
  if (opts.auth) headers.Authorization = opts.auth;
  return new Request(url, { headers });
}

test("rejects when CRON_SECRET is not set", () => {
  delete process.env.CRON_SECRET;
  const r = checkAuth(req());
  assert.ok(r);
  assert.equal(r!.response.status, 500);
});

test("rejects when CRON_SECRET is a forbidden default", () => {
  process.env.CRON_SECRET = "change-me";
  const r = checkAuth(req({ auth: "Bearer change-me" }));
  assert.ok(r);
  assert.equal(r!.response.status, 500);
});

test("rejects when CRON_SECRET is too short", () => {
  process.env.CRON_SECRET = "short-secret";
  const r = checkAuth(req({ auth: "Bearer short-secret" }));
  assert.ok(r);
  assert.equal(r!.response.status, 500);
});

test("rejects when no credentials presented", () => {
  process.env.CRON_SECRET = STRONG_SECRET;
  const r = checkAuth(req());
  assert.ok(r);
  assert.equal(r!.response.status, 401);
});

test("accepts via Authorization Bearer", () => {
  process.env.CRON_SECRET = STRONG_SECRET;
  assert.equal(checkAuth(req({ auth: `Bearer ${STRONG_SECRET}` })), null);
});

test("accepts via ?secret= fallback", () => {
  process.env.CRON_SECRET = STRONG_SECRET;
  assert.equal(checkAuth(req({ query: STRONG_SECRET })), null);
});

test("rejects wrong secret", () => {
  process.env.CRON_SECRET = STRONG_SECRET;
  const r = checkAuth(req({ auth: "Bearer totally-different-but-long-enough-string" }));
  assert.ok(r);
  assert.equal(r!.response.status, 401);
});
