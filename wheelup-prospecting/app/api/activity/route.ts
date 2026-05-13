import { NextResponse } from "next/server";

import { requireSecret } from "@/lib/auth";
import { isLive, sb } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ActivityBody = {
  company_id?: string | null;
  job_id?: string | null;
  candidate_id?: string | null;
  kind: string;        // 'sent' / 'replied' / 'meeting' / 'closed' / 'note'
  channel?: string | null;
  body?: string | null;
  meta?: Record<string, unknown>;
  occurred_at?: string;
  created_by?: string;
};

export async function POST(req: Request) {
  const denied = requireSecret(req);
  if (denied) return denied;
  if (!isLive) {
    return NextResponse.json({ ok: false, error: "supabase not configured" }, { status: 412 });
  }

  const payload = (await req.json()) as ActivityBody;
  if (!payload?.kind) {
    return NextResponse.json({ ok: false, error: "kind required" }, { status: 400 });
  }

  const inserted = await sb.insert("activities", {
    company_id: payload.company_id ?? null,
    job_id: payload.job_id ?? null,
    candidate_id: payload.candidate_id ?? null,
    kind: payload.kind,
    channel: payload.channel ?? null,
    body: payload.body ?? null,
    meta: payload.meta ?? {},
    occurred_at: payload.occurred_at ?? new Date().toISOString(),
    created_by: payload.created_by ?? null,
  });

  return NextResponse.json({ ok: true, activity: (inserted as unknown[])[0] ?? null });
}
