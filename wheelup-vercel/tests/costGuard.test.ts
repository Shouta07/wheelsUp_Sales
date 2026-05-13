import { test } from "node:test";
import assert from "node:assert/strict";
import { llmKilled, checkLLMAllowed } from "../api/_lib/costGuard.ts";

test("llmKilled defaults false", () => {
  delete process.env.KILL_LLM;
  assert.equal(llmKilled(), false);
});

test("llmKilled accepts truthy variants", () => {
  process.env.KILL_LLM = "true";
  assert.equal(llmKilled(), true);
  process.env.KILL_LLM = "1";
  assert.equal(llmKilled(), true);
  process.env.KILL_LLM = "TRUE";
  assert.equal(llmKilled(), true);
});

test("llmKilled rejects other values", () => {
  process.env.KILL_LLM = "false";
  assert.equal(llmKilled(), false);
  process.env.KILL_LLM = "0";
  assert.equal(llmKilled(), false);
});

test("checkLLMAllowed: killswitch wins, returns 503", async () => {
  process.env.KILL_LLM = "true";
  const r = await checkLLMAllowed();
  assert.equal(r.ok, false);
  assert.equal(r.status, 503);
});

test("checkLLMAllowed: no DB → fail-open", async () => {
  delete process.env.KILL_LLM;
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  const r = await checkLLMAllowed();
  assert.equal(r.ok, true);
});
