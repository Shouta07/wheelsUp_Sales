import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getSupabaseAdmin } from "../_lib/supabase-admin.js";

/**
 * 統合 Companies API（Vercel Hobby プラン対応: 1 Function）
 *
 * GET    /api/companies              → 一覧
 * POST   /api/companies/match        → キーワードマッチ
 * POST   /api/companies/sync         → Pipedrive 同期
 * PUT    /api/companies/:id/keywords → キーワード更新
 */
const PIPEDRIVE_BASE = "https://api.pipedrive.com/v1";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const db = getSupabaseAdmin();
  const segments: string[] = Array.isArray(req.query.path)
    ? req.query.path
    : req.query.path
      ? [req.query.path]
      : [];

  // --- /api/companies ---
  if (segments.length === 0) {
    if (req.method === "GET") return listCompanies(db, req, res);
    return res.status(405).json({ error: "Method not allowed" });
  }

  // --- /api/companies/match ---
  if (segments[0] === "match" && req.method === "POST") return matchCompanies(db, req, res);
  // --- /api/companies/sync ---
  if (segments[0] === "sync" && req.method === "POST") return syncCompanies(db, res);
  // --- /api/companies/:id/keywords ---
  if (segments.length === 2 && segments[1] === "keywords" && req.method === "PUT") {
    return updateKeywords(db, segments[0], req, res);
  }

  return res.status(404).json({ error: "Not found" });
}

async function listCompanies(db: ReturnType<typeof getSupabaseAdmin>, req: VercelRequest, res: VercelResponse) {
  const { q, keyword } = req.query;
  let query = db.from("companies").select("*").order("name");
  if (q && typeof q === "string") query = query.ilike("name", `%${q}%`);
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

async function matchCompanies(db: ReturnType<typeof getSupabaseAdmin>, req: VercelRequest, res: VercelResponse) {
  const { keywords } = req.body;
  if (!keywords || keywords.length === 0) return res.status(400).json({ error: "キーワードを1つ以上指定してください" });

  const queryKws: string[] = keywords.map((k: string) => k.trim().toLowerCase());
  const { data: companies } = await db.from("companies").select("*").order("name");
  if (!companies) return res.json({ results: [], total: 0, query_keywords: queryKws });

  const results: Array<Record<string, unknown>> = [];
  for (const c of companies) {
    const companyKws: string[] = ((c.keywords as string[]) || []).map((k) => k.toLowerCase());
    const hits = queryKws.filter((kw) => companyKws.some((ck) => ck.includes(kw)));
    if (hits.length === 0) continue;

    const pitchSummary: string[] = [];
    for (const kw of hits) {
      let found = false;
      for (const [origKw, point] of Object.entries((c.pitch_points as Record<string, string>) || {})) {
        if (origKw.toLowerCase().includes(kw)) { pitchSummary.push(`【${origKw}】${point}`); found = true; break; }
      }
      if (!found) pitchSummary.push(`【${kw}】該当あり`);
    }
    results.push({ company: c, matched_keywords: hits, match_score: hits.length, pitch_summary: pitchSummary });
  }
  results.sort((a, b) => (b.match_score as number) - (a.match_score as number));
  return res.json({ results, total: results.length, query_keywords: queryKws });
}

async function syncCompanies(db: ReturnType<typeof getSupabaseAdmin>, res: VercelResponse) {
  const apiToken = process.env.PIPEDRIVE_API_TOKEN;
  if (!apiToken) return res.status(500).json({ error: "PIPEDRIVE_API_TOKEN not set" });

  const orgs: Array<Record<string, unknown>> = [];
  let start = 0;
  const limit = 100;
  while (true) {
    const resp = await fetch(`${PIPEDRIVE_BASE}/organizations?api_token=${apiToken}&start=${start}&limit=${limit}`);
    const json = await resp.json();
    orgs.push(...(json.data || []));
    if (!json.additional_data?.pagination?.more_items_in_collection) break;
    start = json.additional_data.pagination.next_start || start + limit;
  }

  let count = 0;
  for (const org of orgs) {
    const orgId = org.id as number;
    if (!orgId) continue;
    await db.from("companies").upsert({
      pipedrive_org_id: orgId, name: (org.name as string) || "", address: (org.address as string) || "",
      people_count: (org.people_count as number) || 0, open_deals_count: (org.open_deals_count as number) || 0,
      won_deals_count: (org.won_deals_count as number) || 0, synced_at: new Date().toISOString(),
    }, { onConflict: "pipedrive_org_id" });
    count++;
  }
  return res.json({ synced: count, message: `${count} 件の企業を同期しました` });
}

async function updateKeywords(db: ReturnType<typeof getSupabaseAdmin>, id: string, req: VercelRequest, res: VercelResponse) {
  const { keywords, pitch_points } = req.body;
  const { data: existing } = await db.from("companies").select("pitch_points").eq("id", id).single();
  const merged = { ...(existing?.pitch_points || {}), ...(pitch_points || {}) };
  const { data, error } = await db.from("companies").update({ keywords, pitch_points: merged }).eq("id", id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  return res.json(data);
}
