import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const checks: Record<string, string> = {
    SUPABASE_URL: process.env.SUPABASE_URL ? "set" : "MISSING",
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ? "set" : "MISSING",
    VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL ? "set" : "MISSING",
  };

  try {
    const { createClient } = await import("@supabase/supabase-js");
    checks.supabase_import = "ok";

    if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
      const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
      const { data, error } = await db.from("meeting_transcripts").select("id").limit(1);
      checks.supabase_query = error ? `error: ${error.message}` : `ok (${data?.length ?? 0} rows)`;
    }
  } catch (e: any) {
    checks.supabase_import = `FAIL: ${e.message}`;
  }

  try {
    const { getSupabaseAdmin } = await import("./_lib/supabase-admin.js");
    checks.lib_import = "ok";
  } catch (e: any) {
    checks.lib_import = `FAIL: ${e.message}`;
  }

  return res.json({ ok: true, checks });
}
