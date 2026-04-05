import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getSupabaseAdmin } from "../../_lib/supabase-admin.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const db = getSupabaseAdmin();
  const id = req.query.id as string;
  const { notes, keywords_discovered } = req.body;

  // 現在の候補者を取得
  const { data: c, error } = await db.from("candidates").select("*").eq("id", id).single();
  if (error || !c) return res.status(404).json({ error: "候補者が見つかりません" });

  // キーワード追加
  const existingKws: string[] = c.desired_keywords || [];
  const newKws = [...new Set([...existingKws, ...(keywords_discovered || [])])];

  // アクション履歴追加
  const history = c.action_history || [];
  history.push({
    date: new Date().toISOString().split("T")[0],
    action: "面談実施",
    result: `メモ ${(notes || "").length}文字記録`,
  });

  const { data, error: updateError } = await db
    .from("candidates")
    .update({
      meeting_notes: notes,
      desired_keywords: newKws,
      last_contact_date: new Date().toISOString(),
      status: "in_progress",
      action_history: history,
    })
    .eq("id", id)
    .select()
    .single();

  if (updateError) return res.status(500).json({ error: updateError.message });
  return res.json(data);
}
