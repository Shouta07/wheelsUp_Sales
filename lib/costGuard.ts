// Cost & abuse guard for the LLM-calling endpoints.
//
// Two layered protections, both independent of the rate limiter:
//
//   1. KILL switch: set `KILL_LLM=true` in the environment. Every LLM
//      route returns 503 immediately. Use this as the 30-second response
//      to a leaked key or runaway cost incident.
//
//   2. Daily run cap: counts rows in `crawl_runs` whose `kind` is one of
//      crawl/match/discover for the current UTC day. If the count is
//      already at or above LLM_DAILY_RUN_LIMIT (default 200), refuse.
//      Each route logs exactly one crawl_runs row per invocation, so this
//      is a cost-per-run proxy. Coarse but cheap; intended as a circuit
//      breaker, not a fine-grained quota.
//
// The daily cap query is best-effort: if Supabase is down we fail-open
// (let the request through). The killswitch is checked first and always
// fails-closed.

import { sbSelect, supabaseConfigured } from "./supabase.ts";
import { log } from "./logger.ts";

const COUNTED_KINDS = ["crawl", "match", "discover"] as const;
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

export async function checkLLMAllowed(): Promise<GuardCheck> {
  if (llmKilled()) {
    return {
      ok: false,
      reason: "killswitch",
      status: 503,
      message: "llm_disabled_by_killswitch",
    };
  }

  if (!supabaseConfigured) {
    // No DB → can't count → allow (mock mode).
    return { ok: true, status: 200 };
  }

  const limit = dailyLimit();
  try {
    const since = startOfUtcDayIso();
    // PostgREST returns rows; we only need the count, so cap at limit+1.
    const kinds = COUNTED_KINDS.join(",");
    const rows = await sbSelect<{ id: string }>(
      "crawl_runs",
      `select=id&kind=in.(${kinds})&started_at=gte.${encodeURIComponent(since)}&limit=${limit + 1}`,
    );
    if (rows.length >= limit) {
      log.warn("llm_daily_cap_hit", { count: rows.length, limit });
      return {
        ok: false,
        reason: "daily_limit",
        status: 429,
        message: "llm_daily_limit_reached",
      };
    }
    return { ok: true, status: 200 };
  } catch (e) {
    // Fail-open on DB errors — visibility via logs.
    log.warn("llm_guard_check_failed", { err: (e as Error).message });
    return { ok: true, status: 200 };
  }
}
