import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getSupabaseAdmin } from "../_lib/supabase-admin.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const db = getSupabaseAdmin();
  const { parent_slug } = req.query;

  if (parent_slug && typeof parent_slug === "string") {
    const { data: parent } = await db
      .from("industry_categories")
      .select("id")
      .eq("slug", parent_slug)
      .single();

    if (!parent) return res.status(404).json({ error: "カテゴリが見つかりません" });

    const { data } = await db
      .from("industry_categories")
      .select("*")
      .eq("parent_id", parent.id)
      .order("sort_order");

    return res.json({ categories: data || [], total: (data || []).length });
  }

  const { data } = await db
    .from("industry_categories")
    .select("*")
    .order("level")
    .order("sort_order");

  return res.json({ categories: data || [], total: (data || []).length });
}
