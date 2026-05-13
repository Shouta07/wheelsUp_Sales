import { sbInsert, supabaseConfigured } from "@/lib/supabase";
import { isUuid } from "@/lib/pg";
import { guardRequest, jsonWithId } from "@/lib/apiGuard";
import { WRITE_LIMIT } from "@/lib/ratelimit";
import { log, publicError } from "@/lib/logger";

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

const ALLOWED_KINDS = new Set([
  "proposal_sent",
  "reply",
  "meeting",
  "pass",
  "hire",
  "note",
]);

const ALLOWED_CHANNELS = new Set(["email", "form", "phone", "linkedin", "other"]);

function clampText(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  return v.slice(0, max);
}

function optUuid(v: unknown): string | null {
  if (v == null) return null;
  if (!isUuid(v)) throw new Error("invalid_uuid");
  return v;
}

export async function POST(req: Request) {
  const guard = guardRequest(req, { route: "activity", limit: WRITE_LIMIT });
  if (guard.deny) return guard.deny;
  const { requestId } = guard;

  if (!supabaseConfigured) return jsonWithId({ error: "supabase_not_configured" }, requestId, { status: 400 });

  let payload: ActivityInput;
  try {
    payload = (await req.json()) as ActivityInput;
  } catch {
    return jsonWithId({ error: "invalid_json" }, requestId, { status: 400 });
  }

  if (!payload.kind || !ALLOWED_KINDS.has(payload.kind)) {
    return jsonWithId({ error: "invalid_kind" }, requestId, { status: 400 });
  }
  if (payload.channel && !ALLOWED_CHANNELS.has(payload.channel)) {
    return jsonWithId({ error: "invalid_channel" }, requestId, { status: 400 });
  }
  if (payload.occurred_at && Number.isNaN(Date.parse(payload.occurred_at))) {
    return jsonWithId({ error: "invalid_occurred_at" }, requestId, { status: 400 });
  }

  let row: Record<string, unknown>;
  try {
    row = {
      company_id: optUuid(payload.company_id),
      job_id: optUuid(payload.job_id),
      candidate_id: optUuid(payload.candidate_id),
      match_id: optUuid(payload.match_id),
      kind: payload.kind,
      channel: payload.channel ?? null,
      body: clampText(payload.body, 4000),
      outcome: clampText(payload.outcome, 500),
      occurred_at: payload.occurred_at ?? new Date().toISOString(),
      created_by: clampText(payload.created_by, 120),
    };
  } catch {
    return jsonWithId({ error: "invalid_uuid" }, requestId, { status: 400 });
  }

  try {
    const [inserted] = await sbInsert("activities", [row]);
    return jsonWithId({ ok: true, activity: inserted }, requestId);
  } catch (e) {
    log.error("activity_insert_failed", { requestId, err: publicError(e) });
    return jsonWithId({ error: "insert_failed" }, requestId, { status: 500 });
  }
}
