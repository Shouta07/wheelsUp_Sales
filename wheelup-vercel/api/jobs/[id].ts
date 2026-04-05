import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getSupabaseAdmin } from "../_lib/supabase-admin.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const db = getSupabaseAdmin();
  const { id } = req.query;
  if (!id || typeof id !== "string") {
    return res.status(400).json({ error: "id is required" });
  }

  if (req.method === "GET") {
    const { data, error } = await db
      .from("job_postings")
      .select("*, companies(id, name)")
      .eq("id", id)
      .single();
    if (error) return res.status(404).json({ error: "求人が見つかりません" });
    return res.json(data);
  }

  if (req.method === "PUT") {
    const body = req.body;
    const updates: Record<string, unknown> = {};
    const fields = [
      "title", "company_id", "position_type", "industry_category_slug",
      "employment_type", "salary_min", "salary_max", "location",
      "description", "requirements", "preferred", "required_qualifications",
      "benefits", "keywords", "status", "notes", "external_id",
    ];
    for (const f of fields) {
      if (body[f] !== undefined) updates[f] = body[f];
    }
    if (body.status === "closed" && !updates.closed_at) {
      updates.closed_at = new Date().toISOString();
    }

    const { data, error } = await db
      .from("job_postings")
      .update(updates)
      .eq("id", id)
      .select("*, companies(id, name)")
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data);
  }

  if (req.method === "DELETE") {
    const { error } = await db.from("job_postings").delete().eq("id", id);
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ deleted: true });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
