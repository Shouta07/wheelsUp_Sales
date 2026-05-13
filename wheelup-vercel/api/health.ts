import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const raw = process.env.SUPABASE_URL ?? "";
  let url = raw.trim().replace(/^["']+|["']+$/g, "");
  if (url && !url.startsWith("http")) url = `https://${url}`;
  url = url.replace(/\/+$/, "");

  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();

  const checks: Record<string, string> = {
    SUPABASE_URL_full: url,
    SUPABASE_SERVICE_ROLE_KEY: key ? `set (len=${key.length})` : "MISSING",
  };

  // Test 1: raw fetch to Supabase REST API
  try {
    const r = await fetch(`${url}/rest/v1/`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    checks.raw_fetch = `status=${r.status}`;
  } catch (e: any) {
    checks.raw_fetch = `FAIL: ${e.message}`;
    if (e.cause) checks.raw_fetch_cause = String(e.cause);
  }

  // Test 2: supabase-js client
  try {
    const { createClient } = await import("@supabase/supabase-js");
    const db = createClient(url, key);
    const { data, error } = await db.from("meeting_transcripts").select("id").limit(1);
    checks.supabase_client = error ? `error: ${error.message}` : `ok (${data?.length ?? 0} rows)`;
  } catch (e: any) {
    checks.supabase_client = `FAIL: ${e.message}`;
  }

  return res.json({ ok: true, checks });
}
