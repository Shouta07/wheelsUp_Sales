// Public uptime probe. No auth. Returns 200 + minimal version info so an
// external monitor (Vercel, UptimeRobot, internal Slack ping) can detect
// outage without leaking config. Never reveals env values.

import { supabaseConfigured } from "@/lib/supabase";
import { authConfigured } from "@/lib/sessionAuth";
import { llmKilled } from "@/lib/costGuard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return Response.json({
    ok: true,
    service: "wheelsup-sales",
    mode: supabaseConfigured ? "live" : "mock",
    auth: authConfigured() ? "session+bearer" : "bearer-only",
    llm: llmKilled() ? "disabled" : "enabled",
    time: new Date().toISOString(),
  });
}
