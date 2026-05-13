// Tiny CSV parser — handles quoted fields, escaped quotes, CRLF.

export function parseCSV(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let i = 0;
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  const src = text.replace(/^﻿/, "");
  while (i < src.length) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 2;
        } else {
          inQuotes = false;
          i++;
        }
      } else {
        field += ch;
        i++;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
        i++;
      } else if (ch === ",") {
        row.push(field);
        field = "";
        i++;
      } else if (ch === "\n" || ch === "\r") {
        if (ch === "\r" && src[i + 1] === "\n") i++;
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
        i++;
      } else {
        field += ch;
        i++;
      }
    }
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  if (rows.length === 0) return [];
  const header = rows[0];
  return rows.slice(1)
    .filter((r) => r.some((c) => c.length > 0))
    .map((r) => {
      const o: Record<string, string> = {};
      header.forEach((h, idx) => {
        o[h] = r[idx] ?? "";
      });
      return o;
    });
}

export function coerce(row: Record<string, string>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (v === "" || v == null) {
      out[k] = null;
      continue;
    }
    if (k === "priority" || k === "established_year") {
      const n = Number(v);
      out[k] = Number.isFinite(n) ? n : null;
    } else if (k === "capital_jpy") {
      const n = Number(v);
      out[k] = Number.isFinite(n) ? n : null;
    } else {
      out[k] = v;
    }
  }
  return out;
}
