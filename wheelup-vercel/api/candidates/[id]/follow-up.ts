import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getSupabaseAdmin } from "../../_lib/supabase-admin.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "PUT") return res.status(405).json({ error: "Method not allowed" });

  const db = getSupabaseAdmin();
  const id = req.query.id as string;
  const updates: Record<string, unknown> = {};

  if (req.body.status) updates.status = req.body.status;
  if (req.body.follow_up_date) updates.follow_up_date = req.body.follow_up_date;
  if (req.body.follow_up_priority) updates.follow_up_priority = req.body.follow_up_priority;
  if (req.body.follow_up_notes !== undefined) updates.follow_up_notes = req.body.follow_up_notes;

  const { data, error } = await db
    .from("candidates")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  return res.json(data);
}
