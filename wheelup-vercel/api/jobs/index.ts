import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getSupabaseAdmin } from "../_lib/supabase-admin.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const db = getSupabaseAdmin();

  if (req.method === "GET") {
    const { q, status, company_id } = req.query;
    let query = db
      .from("job_postings")
      .select("*, companies(id, name)")
      .order("created_at", { ascending: false });

    if (status && typeof status === "string") {
      query = query.eq("status", status);
    }
    if (company_id && typeof company_id === "string") {
      query = query.eq("company_id", company_id);
    }
    if (q && typeof q === "string") {
      query = query.or(`title.ilike.%${q}%,location.ilike.%${q}%,description.ilike.%${q}%`);
    }

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ jobs: data || [], total: (data || []).length });
  }

  if (req.method === "POST") {
    const body = req.body;
    if (!body.title) {
      return res.status(400).json({ error: "title は必須です" });
    }

    const row: Record<string, unknown> = {
      title: body.title,
      company_id: body.company_id || null,
      position_type: body.position_type || null,
      industry_category_slug: body.industry_category_slug || null,
      employment_type: body.employment_type || "正社員",
      salary_min: body.salary_min || null,
      salary_max: body.salary_max || null,
      location: body.location || null,
      description: body.description || null,
      requirements: body.requirements || [],
      preferred: body.preferred || [],
      required_qualifications: body.required_qualifications || [],
      benefits: body.benefits || null,
      keywords: body.keywords || [],
      status: body.status || "open",
      source: body.source || "manual",
      external_id: body.external_id || null,
      notes: body.notes || null,
    };

    const { data, error } = await db
      .from("job_postings")
      .insert(row)
      .select("*, companies(id, name)")
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json(data);
  }

  return res.status(405).json({ error: "Method not allowed" });
}
