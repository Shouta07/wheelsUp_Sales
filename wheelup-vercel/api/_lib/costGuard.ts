// Cost & abuse guard for the LLM-calling endpoints.
//
//   1. KILL switch: KILL_LLM=true → every Gemini-calling route returns 503.
//   2. Daily run cap: counts rows in meeting_transcripts with source='gemini'
//      for the current UTC day. The transcribe path always logs a row;
//      score/playbook/coach don't log rows but each writes to score_data —
//      we count those via the daily limit on transcribe + use the in-memory
//      rate limiter for fine-grained.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { log } from "./logger.ts";

const DEFAULT_DAILY_LIMIT = 200;

export interface GuardCheck {
  ok: boolean;
  reason?: "killswitch" | "daily_limit";
  status: number;
  message?: string;
}

export function llmKilled(): boolean {
  const v = process.env.KILL_LLM;
  if (!v) return false;
  return v === "1" || v.toLowerCase() === "true";
}

function dailyLimit(): number {
  const raw = process.env.LLM_DAILY_RUN_LIMIT;
  if (!raw) return DEFAULT_DAILY_LIMIT;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_DAILY_LIMIT;
}

function startOfUtcDayIso(): string {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString();
}

export async function checkLLMAllowed(db?: SupabaseClient): Promise<GuardCheck> {
  if (llmKilled()) {
    return { ok: false, reason: "killswitch", status: 503, message: "llm_disabled_by_killswitch" };
  }
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    // No DB → fail-open (mock-ish mode).
    return { ok: true, status: 200 };
  }
  const client = db ?? createClient(url, key);
  const limit = dailyLimit();
  try {
    const { count, error } = await client
      .from("meeting_transcripts")
      .select("id", { count: "exact", head: true })
      .gte("created_at", startOfUtcDayIso())
      .eq("source", "gemini");
    if (error) {
      log.warn("cost_guard_check_failed", { err: error.message });
      return { ok: true, status: 200 };
    }
    if ((count ?? 0) >= limit) {
      log.warn("llm_daily_cap_hit", { count, limit });
      return { ok: false, reason: "daily_limit", status: 429, message: "llm_daily_limit_reached" };
    }
    return { ok: true, status: 200 };
  } catch (e) {
    log.warn("cost_guard_check_failed", { err: (e as Error).message });
    return { ok: true, status: 200 };
  }
}
