import type { VercelRequest, VercelResponse } from "@vercel/node";
import { llmKilled } from "./_lib/costGuard.ts";

// Public uptime probe. No auth. Never leaks env values.
export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supaConfigured = Boolean(url && key);
  const allowList = Boolean(process.env.ALLOWED_EMAILS);
  const cronSet = Boolean(process.env.CRON_SECRET);
  const gemini = Boolean(process.env.GEMINI_API_KEY);

  // Cheap connectivity check: try to count meeting_transcripts. Bail at 1s.
  let dbReachable: "ok" | "fail" | "skipped" = "skipped";
  if (supaConfigured) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 1000);
      const r = await fetch(`${url}/rest/v1/meeting_transcripts?select=id&limit=1`, {
        headers: { apikey: key!, Authorization: `Bearer ${key!}` },
        signal: controller.signal,
      });
      clearTimeout(timer);
      dbReachable = r.ok ? "ok" : "fail";
    } catch {
      dbReachable = "fail";
    }
  }

  return res.json({
    ok: true,
    service: "wheelup-vercel",
    time: new Date().toISOString(),
    config: {
      supabase: supaConfigured ? "set" : "missing",
      gemini: gemini ? "set" : "missing",
      cron_secret: cronSet ? "set" : "missing",
      allowed_emails: allowList ? "set" : "missing",
    },
    db: dbReachable,
    llm: llmKilled() ? "disabled" : "enabled",
  });
}
