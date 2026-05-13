import { test } from "node:test";
import assert from "node:assert/strict";
import { isEmailAllowed, teamAuthEnabled } from "../lib/sessionAuth.ts";

test("isEmailAllowed: empty allow list fails closed", () => {
  delete process.env.ALLOWED_EMAILS;
  assert.equal(isEmailAllowed("anyone@example.com"), false);
  process.env.ALLOWED_EMAILS = "";
  assert.equal(isEmailAllowed("anyone@example.com"), false);
});

test("isEmailAllowed: matches case-insensitively", () => {
  process.env.ALLOWED_EMAILS = "Alice@Example.com, bob@example.com";
  assert.equal(isEmailAllowed("alice@example.com"), true);
  assert.equal(isEmailAllowed("ALICE@example.com"), true);
  assert.equal(isEmailAllowed("BOB@EXAMPLE.COM"), true);
  assert.equal(isEmailAllowed("charlie@example.com"), false);
  assert.equal(isEmailAllowed(""), false);
  assert.equal(isEmailAllowed(null), false);
  assert.equal(isEmailAllowed(undefined), false);
});

test("isEmailAllowed: ignores whitespace and empty entries", () => {
  process.env.ALLOWED_EMAILS = " , alice@example.com ,, ";
  assert.equal(isEmailAllowed("alice@example.com"), true);
});

test("teamAuthEnabled requires both Supabase config and allow list", () => {
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  delete process.env.ALLOWED_EMAILS;
  assert.equal(teamAuthEnabled(), false);

  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://x.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
  assert.equal(teamAuthEnabled(), false);

  process.env.ALLOWED_EMAILS = "x@y.com";
  assert.equal(teamAuthEnabled(), true);
});
