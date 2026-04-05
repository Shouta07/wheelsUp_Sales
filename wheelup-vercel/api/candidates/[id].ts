import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getSupabaseAdmin } from "../_lib/supabase-admin.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const db = getSupabaseAdmin();
  const id = req.query.id as string;

  if (req.method === "GET") {
    const { data, error } = await db.from("candidates").select("*").eq("id", id).single();
    if (error) return res.status(404).json({ error: "候補者が見つかりません" });
    return res.json(data);
  }

  if (req.method === "PUT") {
    const body = req.body;
    const { data, error } = await db.from("candidates").update(body).eq("id", id).select().single();
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data);
  }

  return res.status(405).json({ error: "Method not allowed" });
}
