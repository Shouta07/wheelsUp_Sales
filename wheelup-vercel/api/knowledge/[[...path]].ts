import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getSupabaseAdmin } from "../_lib/supabase-admin.js";

/**
 * 統合 Knowledge API（Vercel Hobby プラン対応: 1 Function）
 *
 * GET    /api/knowledge/taxonomy            → カテゴリ一覧
 * GET    /api/knowledge/taxonomy/:slug      → カテゴリ詳細
 * GET    /api/knowledge/qualifications      → 資格一覧
 * POST   /api/knowledge/progress            → 進捗記録
 * GET    /api/knowledge/progress/:userName  → 進捗取得
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const db = getSupabaseAdmin();
  const segments: string[] = Array.isArray(req.query.path)
    ? req.query.path
    : req.query.path
      ? [req.query.path]
      : [];

  if (segments.length === 0) return res.status(404).json({ error: "Not found" });

  const sub = segments[0];

  // --- /api/knowledge/taxonomy ---
  if (sub === "taxonomy") {
    if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

    // /api/knowledge/taxonomy/:slug
    if (segments[1]) {
      const slug = segments[1];
      const { data, error } = await db.from("industry_categories").select("*").eq("slug", slug).single();
      if (error || !data) return res.status(404).json({ error: "カテゴリが見つかりません" });
      return res.json(data);
    }

    // /api/knowledge/taxonomy?parent_slug=...
    const { parent_slug } = req.query;
    if (parent_slug && typeof parent_slug === "string") {
      const { data: parent } = await db.from("industry_categories").select("id").eq("slug", parent_slug).single();
      if (!parent) return res.status(404).json({ error: "カテゴリが見つかりません" });
      const { data } = await db.from("industry_categories").select("*").eq("parent_id", parent.id).order("sort_order");
      return res.json({ categories: data || [], total: (data || []).length });
    }

    const { data } = await db.from("industry_categories").select("*").order("level").order("sort_order");
    return res.json({ categories: data || [], total: (data || []).length });
  }

  // --- /api/knowledge/qualifications ---
  if (sub === "qualifications") {
    if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
    const { field } = req.query;
    let query = db.from("qualifications").select("*").order("field").order("name");
    if (field && typeof field === "string") query = query.eq("field", field);
    const { data } = await query;
    return res.json({ qualifications: data || [], total: (data || []).length });
  }

  // --- /api/knowledge/progress ---
  if (sub === "progress") {
    // POST /api/knowledge/progress
    if (!segments[1]) {
      if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
      const { data, error } = await db.from("learning_progress").insert(req.body).select().single();
      if (error) return res.status(500).json({ error: error.message });
      return res.json(data);
    }

    // GET /api/knowledge/progress/:userName
    if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
    const userName = segments[1];
    const { data } = await db.from("learning_progress").select("*").eq("user_name", userName).order("studied_at", { ascending: false });
    const entries = data || [];
    return res.json({
      user_name: userName,
      total_studied: entries.length,
      completed: entries.filter((e: Record<string, unknown>) => e.completed).length,
      entries,
    });
  }

  return res.status(404).json({ error: "Not found" });
}
