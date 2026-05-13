// Thin Supabase REST client. No SDK — just fetch + PostgREST conventions.
//
// All filter values **must** go through lib/pg helpers; never interpolate
// raw user input into `query` strings.

import { log, publicError } from "./logger";

const SB_URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const supabaseConfigured = Boolean(SB_URL && KEY);

function headers(extra: Record<string, string> = {}): HeadersInit {
  if (!SB_URL || !KEY) throw new Error("Supabase not configured");
  return {
    apikey: KEY,
    Authorization: `Bearer ${KEY}`,
    "Content-Type": "application/json",
    Accept: "application/json",
    ...extra,
  };
}

async function sbFail(action: string, table: string, res: Response): Promise<never> {
  // Read body but only log the first 500 chars; do not propagate to the
  // public response.
  const body = await res.text().catch(() => "");
  log.error("supabase_error", {
    action,
    table,
    status: res.status,
    body: body.slice(0, 500),
  });
  throw new Error(`${action} ${table} failed: ${res.status}`);
}

export async function sbSelect<T = unknown>(
  table: string,
  query: string = "select=*"
): Promise<T[]> {
  if (!SB_URL) throw new Error("Supabase not configured");
  const res = await fetch(`${SB_URL}/rest/v1/${table}?${query}`, {
    method: "GET",
    headers: headers(),
    cache: "no-store",
  });
  if (!res.ok) return sbFail("sbSelect", table, res);
  return res.json();
}

export async function sbInsert<T = unknown>(
  table: string,
  rows: Record<string, unknown>[],
  opts: { onConflict?: string; returning?: boolean } = {}
): Promise<T[]> {
  if (!SB_URL) throw new Error("Supabase not configured");
  const params = new URLSearchParams();
  if (opts.onConflict) params.set("on_conflict", opts.onConflict);
  const preferParts = [opts.onConflict ? "resolution=merge-duplicates" : ""];
  preferParts.push(opts.returning === false ? "return=minimal" : "return=representation");
  const res = await fetch(`${SB_URL}/rest/v1/${table}?${params.toString()}`, {
    method: "POST",
    headers: headers({ Prefer: preferParts.filter(Boolean).join(",") }),
    body: JSON.stringify(rows),
  });
  if (!res.ok) return sbFail("sbInsert", table, res);
  if (opts.returning === false) return [];
  return res.json();
}

export async function sbUpdate<T = unknown>(
  table: string,
  patch: Record<string, unknown>,
  filter: string
): Promise<T[]> {
  if (!SB_URL) throw new Error("Supabase not configured");
  const res = await fetch(`${SB_URL}/rest/v1/${table}?${filter}`, {
    method: "PATCH",
    headers: headers({ Prefer: "return=representation" }),
    body: JSON.stringify(patch),
  });
  if (!res.ok) return sbFail("sbUpdate", table, res);
  return res.json();
}

// Re-export so existing route imports keep working.
export { requireSecret } from "./auth";
export { publicError };
