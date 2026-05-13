import { test } from "node:test";
import assert from "node:assert/strict";
import { extractJson, safeJsonParse } from "../api/_lib/json-extract.ts";

test("extractJson: handles fenced ```json blocks", () => {
  const raw = "前置き...\n```json\n{\"a\":1}\n```\n後置き";
  assert.equal(extractJson(raw), `{"a":1}`);
});

test("extractJson: handles unfenced object with prose around it", () => {
  const raw = "意気込みなどの説明…\n{\"scores\":{\"needs\":7}, \"total\":7}\n以上です";
  assert.equal(extractJson(raw), `{"scores":{"needs":7}, "total":7}`);
});

test("extractJson: handles nested braces correctly", () => {
  const raw = `{"a":{"b":{"c":3}},"d":4}`;
  assert.equal(extractJson(raw), raw);
});

test("extractJson: braces inside strings don't confuse depth", () => {
  const raw = `{"msg":"this has a } and { inside","ok":true}`;
  assert.equal(extractJson(raw), raw);
});

test("extractJson: arrays", () => {
  const raw = "ok ```\n[1,2,{\"a\":3}]\n```";
  assert.equal(extractJson(raw), `[1,2,{"a":3}]`);
});

test("safeJsonParse: parses good JSON", () => {
  const r = safeJsonParse<{ a: number }>(`{"a":1}`);
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.value.a, 1);
});

test("safeJsonParse: returns error on bad JSON", () => {
  const r = safeJsonParse(`not json`);
  assert.equal(r.ok, false);
});
