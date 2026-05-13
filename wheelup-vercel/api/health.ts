import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const raw = process.env.SUPABASE_URL ?? "";
  let url = raw.trim().replace(/^["']+|["']+$/g, "");
  if (url && !url.startsWith("http")) url = `https://${url}`;
  url = url.replace(/\/+$/, "");

  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();

  const checks: Record<string, string> = {
    SUPABASE_URL: raw ? "set" : "MISSING",
    SUPABASE_URL_raw_starts: raw.substring(0, 15),
    SUPABASE_URL_fixed: url.substring(0, 20) + "...",
    SUPABASE_SERVICE_ROLE_KEY: key ? "set" : "MISSING",
    VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL ? "set" : "MISSING",
  };

  try {
    const { createClient } = await import("@supabase/supabase-js");
    checks.supabase_import = "ok";

    if (url && key) {
      const db = createClient(url, key);
      const { data, error } = await db.from("meeting_transcripts").select("id").limit(1);
      checks.supabase_query = error ? `error: ${error.message}` : `ok (${data?.length ?? 0} rows)`;
    }
  } catch (e: any) {
    checks.supabase_import = `FAIL: ${e.message}`;
  }

  try {
    const { getSupabaseAdmin } = await import("./_lib/supabase-admin.js");
    const db = getSupabaseAdmin();
    checks.lib_import = "ok";
    const { data, error } = await db.from("meeting_transcripts").select("id").limit(1);
    checks.lib_query = error ? `error: ${error.message}` : `ok (${data?.length ?? 0} rows)`;
  } catch (e: any) {
    checks.lib_import = `FAIL: ${e.message}`;
  }

  return res.json({ ok: true, checks });
}
