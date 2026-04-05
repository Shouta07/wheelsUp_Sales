import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getSupabaseAdmin } from "../../_lib/supabase-admin.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const db = getSupabaseAdmin();
  const id = req.query.id as string;
  const { action, result } = req.body;

  const { data: c, error } = await db.from("candidates").select("*").eq("id", id).single();
  if (error || !c) return res.status(404).json({ error: "候補者が見つかりません" });

  const history = c.action_history || [];
  history.push({
    date: new Date().toISOString().split("T")[0],
    action,
    result: result || "",
  });

  const { data, error: updateError } = await db
    .from("candidates")
    .update({
      action_history: history,
      last_contact_date: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();

  if (updateError) return res.status(500).json({ error: updateError.message });
  return res.json(data);
}
