import { requireSecret, sbInsert, supabaseConfigured } from "@/lib/supabase";

export const runtime = "nodejs";

interface ActivityInput {
  company_id?: string | null;
  job_id?: string | null;
  candidate_id?: string | null;
  match_id?: string | null;
  kind: string;
  channel?: string | null;
  body?: string | null;
  outcome?: string | null;
  occurred_at?: string | null;
  created_by?: string | null;
}

export async function POST(req: Request) {
  const unauth = requireSecret(req);
  if (unauth) return unauth;
  if (!supabaseConfigured) return Response.json({ error: "Supabase not configured" }, { status: 400 });

  let payload: ActivityInput;
  try {
    payload = (await req.json()) as ActivityInput;
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }
  if (!payload.kind) return Response.json({ error: "kind required" }, { status: 400 });

  const row = {
    company_id: payload.company_id ?? null,
    job_id: payload.job_id ?? null,
    candidate_id: payload.candidate_id ?? null,
    match_id: payload.match_id ?? null,
    kind: payload.kind,
    channel: payload.channel ?? null,
    body: payload.body ?? null,
    outcome: payload.outcome ?? null,
    occurred_at: payload.occurred_at ?? new Date().toISOString(),
    created_by: payload.created_by ?? null,
  };
  const [inserted] = await sbInsert("activities", [row]);
  return Response.json({ ok: true, activity: inserted });
}
