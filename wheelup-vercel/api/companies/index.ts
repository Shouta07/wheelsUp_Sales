import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getSupabaseAdmin } from "../_lib/supabase-admin.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const db = getSupabaseAdmin();

  if (req.method === "GET") {
    const { q, keyword } = req.query;
    let query = db.from("companies").select("*").order("name");

    if (q && typeof q === "string") {
      query = query.ilike("name", `%${q}%`);
    }
    // keyword filtering done in-app since Supabase array search is limited
    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });

    let companies = data || [];
    if (keyword && typeof keyword === "string") {
      const kw = keyword.toLowerCase();
      companies = companies.filter((c: Record<string, unknown>) =>
        ((c.keywords as string[]) || []).some((k) => k.toLowerCase().includes(kw)),
      );
    }

    return res.json({ companies, total: companies.length });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
