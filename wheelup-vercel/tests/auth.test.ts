import { test } from "node:test";
import assert from "node:assert/strict";
import { authMode, isEmailAllowed } from "../api/_lib/auth.ts";

test("isEmailAllowed: empty list fails closed", () => {
  delete process.env.ALLOWED_EMAILS;
  assert.equal(isEmailAllowed("anyone@example.com"), false);
  process.env.ALLOWED_EMAILS = "";
  assert.equal(isEmailAllowed("anyone@example.com"), false);
});

test("isEmailAllowed: case-insensitive match", () => {
  process.env.ALLOWED_EMAILS = "Alice@Example.com, bob@example.com";
  assert.equal(isEmailAllowed("alice@example.com"), true);
  assert.equal(isEmailAllowed("BOB@EXAMPLE.COM"), true);
  assert.equal(isEmailAllowed("charlie@example.com"), false);
  assert.equal(isEmailAllowed(null), false);
});

test("isEmailAllowed: ignores empty entries / whitespace", () => {
  process.env.ALLOWED_EMAILS = " , alice@example.com ,,";
  assert.equal(isEmailAllowed("alice@example.com"), true);
});

test("authMode: defaults to team", () => {
  delete process.env.AUTH_MODE;
  assert.equal(authMode(), "team");
});

test("authMode: open / mock are recognized", () => {
  process.env.AUTH_MODE = "open";
  assert.equal(authMode(), "open");
  process.env.AUTH_MODE = "OPEN";
  assert.equal(authMode(), "open");
  process.env.AUTH_MODE = "mock";
  assert.equal(authMode(), "mock");
  process.env.AUTH_MODE = "garbage";
  assert.equal(authMode(), "team");
});
