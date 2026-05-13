import { test } from "node:test";
import assert from "node:assert/strict";
import { coerce, parseCSV } from "../lib/csv.ts";

test("parseCSV handles quoted fields and CRLF", () => {
  const text = `name,note\r\n"Acme, Inc.","line1\nline2"\r\nFoo,bar\r\n`;
  const rows = parseCSV(text);
  assert.equal(rows.length, 2);
  assert.equal(rows[0]!.name, "Acme, Inc.");
  assert.equal(rows[0]!.note, "line1\nline2");
  assert.equal(rows[1]!.name, "Foo");
});

test("parseCSV escaped quotes", () => {
  const rows = parseCSV(`a\n"He said ""hi"""\n`);
  assert.equal(rows[0]!.a, `He said "hi"`);
});

test("coerce numeric fields", () => {
  const out = coerce({ name: "X", priority: "5", capital_jpy: "10000000", established_year: "1999", notes: "" });
  assert.equal(out.name, "X");
  assert.equal(out.priority, 5);
  assert.equal(out.capital_jpy, 10000000);
  assert.equal(out.established_year, 1999);
  assert.equal(out.notes, null);
});
