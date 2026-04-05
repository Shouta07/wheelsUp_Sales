import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getSupabaseAdmin } from "../../_lib/supabase-admin.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const db = getSupabaseAdmin();
  const slug = req.query.slug as string;

  const { data, error } = await db
    .from("industry_categories")
    .select("*")
    .eq("slug", slug)
    .single();

  if (error || !data) return res.status(404).json({ error: "カテゴリが見つかりません" });
  return res.json(data);
}
