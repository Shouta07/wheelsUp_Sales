import { test } from "node:test";
import assert from "node:assert/strict";
import { checkLLMAllowed, llmKilled } from "../lib/costGuard.ts";

test("llmKilled: defaults to false", () => {
  delete process.env.KILL_LLM;
  assert.equal(llmKilled(), false);
});

test("llmKilled: accepts 'true' / '1'", () => {
  process.env.KILL_LLM = "true";
  assert.equal(llmKilled(), true);
  process.env.KILL_LLM = "1";
  assert.equal(llmKilled(), true);
  process.env.KILL_LLM = "TRUE";
  assert.equal(llmKilled(), true);
});

test("llmKilled: rejects other truthy-ish values", () => {
  process.env.KILL_LLM = "false";
  assert.equal(llmKilled(), false);
  process.env.KILL_LLM = "0";
  assert.equal(llmKilled(), false);
  process.env.KILL_LLM = "";
  assert.equal(llmKilled(), false);
});

test("checkLLMAllowed: killswitch wins, returns 503", async () => {
  process.env.KILL_LLM = "true";
  const r = await checkLLMAllowed();
  assert.equal(r.ok, false);
  assert.equal(r.status, 503);
  assert.equal(r.reason, "killswitch");
});

test("checkLLMAllowed: no DB → fail-open in mock mode", async () => {
  delete process.env.KILL_LLM;
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  // Note: supabaseConfigured is evaluated at module-load time. This test
  // verifies the killswitch path; the in-process value of
  // supabaseConfigured may already be `false` from the test process, so
  // the function should return ok:true.
  const r = await checkLLMAllowed();
  assert.equal(r.ok, true);
  assert.equal(r.status, 200);
});
