import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getSupabaseAdmin, normalizeSupabaseUrl } from "./_lib/supabase-admin.js";

/**
 * 診断エンドポイント。
 *  GET /api/health           → Supabase 設定 / 接続 / 主要テーブル疎通を返す
 *  GET /api/health?reveal=1  → URL 値も表示（デバッグ用、本番では避ける）
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const reveal = req.query.reveal === "1";
  const rawUrl = process.env.SUPABASE_URL ?? "";
  const url = normalizeSupabaseUrl(rawUrl);
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();

  const checks: Record<string, unknown> = {
    SUPABASE_URL: url ? "set" : "MISSING",
    SUPABASE_SERVICE_ROLE_KEY: key ? "set" : "MISSING",
    GEMINI_API_KEY: process.env.GEMINI_API_KEY ? "set" : "MISSING",
  };
  if (reveal) checks.SUPABASE_URL_value = url;

  if (!url || !key) {
    return res.status(500).json({ ok: false, checks });
  }

  try {
    const r = await fetch(`${url}/rest/v1/`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    checks.rest_api = `status=${r.status}`;
  } catch (e) {
    checks.rest_api = `FAIL: ${(e as Error).message}`;
  }

  try {
    const db = getSupabaseAdmin();
    const { error, count } = await db
      .from("meeting_transcripts")
      .select("id", { count: "exact", head: true });
    checks.meeting_transcripts = error ? `error: ${error.message}` : `ok (${count ?? 0} rows)`;
  } catch (e) {
    checks.meeting_transcripts = `FAIL: ${(e as Error).message}`;
  }

  return res.json({ ok: true, checks });
}
