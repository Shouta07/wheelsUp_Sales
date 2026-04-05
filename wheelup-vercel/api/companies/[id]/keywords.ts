import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getSupabaseAdmin } from "../../_lib/supabase-admin.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "PUT") return res.status(405).json({ error: "Method not allowed" });

  const db = getSupabaseAdmin();
  const id = req.query.id as string;
  const { keywords, pitch_points } = req.body;

  // 既存の pitch_points をマージ
  const { data: existing } = await db.from("companies").select("pitch_points").eq("id", id).single();
  const merged = { ...(existing?.pitch_points || {}), ...(pitch_points || {}) };

  const { data, error } = await db
    .from("companies")
    .update({ keywords, pitch_points: merged })
    .eq("id", id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  return res.json(data);
}
