import { test } from "node:test";
import assert from "node:assert/strict";
import { assertUuid, clampInt, isUuid, pgEq, pgInUuids } from "../lib/pg.ts";

test("isUuid", () => {
  assert.equal(isUuid("11111111-2222-3333-4444-555555555555"), true);
  assert.equal(isUuid("not-a-uuid"), false);
  assert.equal(isUuid(""), false);
  assert.equal(isUuid("11111111-2222-3333-4444-555555555555; drop table"), false);
});

test("assertUuid throws on bad input", () => {
  assert.throws(() => assertUuid("oops", "company_id"), /invalid company_id/);
});

test("pgEq URL-encodes values", () => {
  assert.equal(pgEq("id", "abc,def"), "id=eq.abc%2Cdef");
  assert.equal(pgEq("status", "active"), "status=eq.active");
  assert.equal(pgEq("is_open", true), "is_open=eq.true");
});

test("pgEq blocks PostgREST parser confusion", () => {
  // A would-be smuggled filter like `,is_active=eq.false` must be encoded so
  // PostgREST treats it as a single value.
  const out = pgEq("id", "11111111-2222-3333-4444-555555555555,is_active=eq.false");
  assert.ok(!out.includes(",is_active"), out);
  assert.ok(out.includes("%2Cis_active%3Deq.false"));
});

test("pgInUuids rejects non-uuid entries", () => {
  assert.throws(() => pgInUuids("job_id", ["11111111-2222-3333-4444-555555555555", "evil"]));
});

test("pgInUuids accepts valid uuids", () => {
  const ids = [
    "11111111-2222-3333-4444-555555555555",
    "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
  ];
  assert.equal(pgInUuids("job_id", ids), `job_id=in.(${ids.join(",")})`);
});

test("clampInt bounds + defaults", () => {
  assert.equal(clampInt("5", 10, 100), 5);
  assert.equal(clampInt(null, 10, 100), 10);
  assert.equal(clampInt("abc", 10, 100), 10);
  assert.equal(clampInt("9999", 10, 100), 100);
  assert.equal(clampInt("-5", 10, 100, 1), 1);
});
