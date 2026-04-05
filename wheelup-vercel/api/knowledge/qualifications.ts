import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getSupabaseAdmin } from "../_lib/supabase-admin.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const db = getSupabaseAdmin();
  const { field } = req.query;

  let query = db.from("qualifications").select("*").order("field").order("name");
  if (field && typeof field === "string") {
    query = query.eq("field", field);
  }

  const { data } = await query;
  return res.json({ qualifications: data || [], total: (data || []).length });
}
