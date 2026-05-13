import { requireSecret, sbInsert, supabaseConfigured } from "@/lib/supabase";
import { geminiConfigured } from "@/lib/gemini";

export const runtime = "nodejs";
export const maxDuration = 300;

async function callInternal(req: Request, path: string): Promise<unknown> {
  const base = new URL(req.url);
  base.pathname = path;
  // secret stays in query string
  const res = await fetch(base.toString(), { method: "POST" });
  return res.json().catch(() => ({ status: res.status }));
}

export async function GET(req: Request) {
  const unauth = requireSecret(req);
  if (unauth) return unauth;
  if (!supabaseConfigured) return Response.json({ error: "Supabase not configured" }, { status: 400 });
  if (!geminiConfigured) return Response.json({ error: "GEMINI_API_KEY not set" }, { status: 400 });

  const startedAt = new Date().toISOString();
  const crawl = await callInternal(req, "/api/crawl");
  const match = await callInternal(req, "/api/match");
  const finishedAt = new Date().toISOString();

  await sbInsert("crawl_runs", [{
    kind: "cron",
    status: "ok",
    stats: { crawl, match },
    started_at: startedAt,
    finished_at: finishedAt,
  }], { returning: false });

  return Response.json({ ok: true, crawl, match });
}

export const POST = GET;
