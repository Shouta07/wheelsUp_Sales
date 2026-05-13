import { NextResponse } from "next/server";

import { requireSecret } from "@/lib/auth";
import { isLive, sb } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function selfPost(req: Request, path: string) {
  const u = new URL(req.url);
  u.pathname = path;
  // Preserve the secret param for downstream auth.
  const target = u.toString();
  const res = await fetch(target, {
    method: "POST",
    headers: req.headers.get("authorization")
      ? { Authorization: req.headers.get("authorization")! }
      : {},
    cache: "no-store",
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, body: json };
}

export async function GET(req: Request) {
  const denied = requireSecret(req);
  if (denied) return denied;
  if (!isLive) {
    return NextResponse.json({ ok: false, error: "supabase not configured" }, { status: 412 });
  }

  const startedAt = new Date().toISOString();
  const crawl = await selfPost(req, "/api/crawl");
  const match = await selfPost(req, "/api/match");

  const ok = crawl.status < 400 && match.status < 400;
  await sb.insert("crawl_runs", {
    kind: "cron",
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    ok,
    stats: { crawl: crawl.body, match: match.body },
    error: ok ? null : `crawl=${crawl.status} match=${match.status}`,
  });

  return NextResponse.json({ ok, crawl: crawl.body, match: match.body });
}

export const POST = GET;
