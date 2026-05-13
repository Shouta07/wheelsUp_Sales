import { sbInsert, supabaseConfigured } from "@/lib/supabase";
import { geminiConfigured } from "@/lib/gemini";
import { guardRequest, jsonWithId } from "@/lib/apiGuard";
import { LLM_LIMIT } from "@/lib/ratelimit";
import { log, publicError } from "@/lib/logger";

export const runtime = "nodejs";
export const maxDuration = 300;

async function callInternal(req: Request, path: string, requestId: string): Promise<unknown> {
  const base = new URL(req.url);
  base.pathname = path;
  // Forward the caller's secret via Authorization header. Strip query secret
  // from the chained call so it doesn't end up in downstream access logs.
  base.searchParams.delete("secret");
  const incomingAuth = req.headers.get("authorization");
  const queryFallback = new URL(req.url).searchParams.get("secret");
  const headers: Record<string, string> = { "X-Request-Id": requestId };
  if (incomingAuth) headers["Authorization"] = incomingAuth;
  else if (queryFallback) headers["Authorization"] = `Bearer ${queryFallback}`;

  try {
    const res = await fetch(base.toString(), { method: "POST", headers });
    return await res.json().catch(() => ({ status: res.status }));
  } catch (e) {
    log.error("cron_subcall_failed", { requestId, path, err: publicError(e) });
    return { error: "subcall_failed" };
  }
}

export async function GET(req: Request) {
  // Cron runs sub-calls, so it bumps the LLM bucket but its own bucket is
  // identical. Internal subcalls will also be checked but they come from the
  // same process so the IP is `unknown` — they share a bucket and that's OK.
  const guard = guardRequest(req, { route: "cron", limit: LLM_LIMIT });
  if (guard.deny) return guard.deny;
  const { requestId } = guard;

  if (!supabaseConfigured) return jsonWithId({ error: "supabase_not_configured" }, requestId, { status: 400 });
  if (!geminiConfigured) return jsonWithId({ error: "gemini_not_configured" }, requestId, { status: 400 });

  const startedAt = new Date().toISOString();
  const crawl = await callInternal(req, "/api/crawl", requestId);
  const match = await callInternal(req, "/api/match", requestId);
  const finishedAt = new Date().toISOString();

  await sbInsert("crawl_runs", [{
    kind: "cron",
    status: "ok",
    stats: { crawl, match },
    started_at: startedAt,
    finished_at: finishedAt,
  }], { returning: false });

  return jsonWithId({ ok: true, crawl, match }, requestId);
}

export const POST = GET;
