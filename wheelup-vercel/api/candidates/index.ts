import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getSupabaseAdmin } from "../_lib/supabase-admin.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const db = getSupabaseAdmin();

  if (req.method === "GET") {
    const { status, q, follow_up_due } = req.query;
    let query = db.from("candidates").select("*").order("updated_at", { ascending: false });

    if (status && typeof status === "string") {
      query = query.eq("status", status);
    }
    if (q && typeof q === "string") {
      query = query.or(`name.ilike.%${q}%,current_company.ilike.%${q}%`);
    }
    if (follow_up_due === "true") {
      query = query
        .lte("follow_up_date", new Date().toISOString())
        .not("status", "in", '("placed","lost")');
    }

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });

    // days_since_contact を計算
    const now = Date.now();
    const candidates = (data || []).map((c: Record<string, unknown>) => ({
      ...c,
      days_since_contact: c.last_contact_date
        ? Math.floor((now - new Date(c.last_contact_date as string).getTime()) / 86400000)
        : 0,
    }));

    return res.json({ candidates, total: candidates.length });
  }

  if (req.method === "POST") {
    const body = req.body;
    const { data, error } = await db.from("candidates").insert(body).select().single();
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data);
  }

  return res.status(405).json({ error: "Method not allowed" });
}
