import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getSupabaseAdmin } from "../_lib/supabase-admin.js";

/**
 * 統合 Jobs API（Vercel Hobby プラン対応: 1 Function）
 *
 * GET    /api/jobs              → 一覧
 * POST   /api/jobs              → 新規作成
 * GET    /api/jobs/:id          → 詳細
 * PUT    /api/jobs/:id          → 更新
 * DELETE /api/jobs/:id          → 削除
 * POST   /api/jobs/import       → CSVインポート
 * POST   /api/jobs/match        → 候補者マッチング
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const db = getSupabaseAdmin();
  const segments: string[] = Array.isArray(req.query.path)
    ? req.query.path
    : req.query.path
      ? [req.query.path]
      : [];

  // --- /api/jobs ---
  if (segments.length === 0) {
    if (req.method === "GET") return listJobs(db, req, res);
    if (req.method === "POST") return createJob(db, req, res);
    return res.status(405).json({ error: "Method not allowed" });
  }

  // --- /api/jobs/import ---
  if (segments[0] === "import" && req.method === "POST") return importJobs(db, req, res);
  // --- /api/jobs/match ---
  if (segments[0] === "match" && req.method === "POST") return matchJobs(db, req, res);

  // --- /api/jobs/:id ---
  const id = segments[0];
  if (req.method === "GET") {
    const { data, error } = await db.from("job_postings").select("*, companies(id, name)").eq("id", id).single();
    if (error) return res.status(404).json({ error: "求人が見つかりません" });
    return res.json(data);
  }
  if (req.method === "PUT") {
    const body = req.body;
    const updates: Record<string, unknown> = {};
    const fields = ["title", "company_id", "position_type", "industry_category_slug", "employment_type", "salary_min", "salary_max", "location", "description", "requirements", "preferred", "required_qualifications", "benefits", "keywords", "status", "notes", "external_id"];
    for (const f of fields) { if (body[f] !== undefined) updates[f] = body[f]; }
    if (body.status === "closed" && !updates.closed_at) updates.closed_at = new Date().toISOString();
    const { data, error } = await db.from("job_postings").update(updates).eq("id", id).select("*, companies(id, name)").single();
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data);
  }
  if (req.method === "DELETE") {
    const { error } = await db.from("job_postings").delete().eq("id", id);
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ deleted: true });
  }

  return res.status(404).json({ error: "Not found" });
}

/* ---------- helpers ---------- */

async function listJobs(db: ReturnType<typeof getSupabaseAdmin>, req: VercelRequest, res: VercelResponse) {
  const { q, status, company_id } = req.query;
  let query = db.from("job_postings").select("*, companies(id, name)").order("created_at", { ascending: false });
  if (status && typeof status === "string") query = query.eq("status", status);
  if (company_id && typeof company_id === "string") query = query.eq("company_id", company_id);
  if (q && typeof q === "string") query = query.or(`title.ilike.%${q}%,location.ilike.%${q}%,description.ilike.%${q}%`);
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ jobs: data || [], total: (data || []).length });
}

async function createJob(db: ReturnType<typeof getSupabaseAdmin>, req: VercelRequest, res: VercelResponse) {
  const body = req.body;
  if (!body.title) return res.status(400).json({ error: "title は必須です" });
  const row: Record<string, unknown> = {
    title: body.title, company_id: body.company_id || null, position_type: body.position_type || null,
    industry_category_slug: body.industry_category_slug || null, employment_type: body.employment_type || "正社員",
    salary_min: body.salary_min || null, salary_max: body.salary_max || null, location: body.location || null,
    description: body.description || null, requirements: body.requirements || [], preferred: body.preferred || [],
    required_qualifications: body.required_qualifications || [], benefits: body.benefits || null,
    keywords: body.keywords || [], status: body.status || "open", source: body.source || "manual",
    external_id: body.external_id || null, notes: body.notes || null,
  };
  const { data, error } = await db.from("job_postings").insert(row).select("*, companies(id, name)").single();
  if (error) return res.status(500).json({ error: error.message });
  return res.status(201).json(data);
}

async function importJobs(db: ReturnType<typeof getSupabaseAdmin>, req: VercelRequest, res: VercelResponse) {
  const { rows } = req.body;
  if (!Array.isArray(rows) || rows.length === 0) return res.status(400).json({ error: "rows 配列が必要です" });

  const headerMap: Record<string, string> = {
    "求人タイトル": "title", "タイトル": "title", title: "title",
    "企業名": "_company_name", company_name: "_company_name",
    "職種": "position_type", position_type: "position_type",
    "業界カテゴリ": "industry_category_slug", industry_category_slug: "industry_category_slug",
    "雇用形態": "employment_type", employment_type: "employment_type",
    "年収下限": "salary_min", salary_min: "salary_min",
    "年収上限": "salary_max", salary_max: "salary_max",
    "勤務地": "location", location: "location",
    "仕事内容": "description", description: "description",
    "必須条件": "requirements", requirements: "requirements",
    "歓迎条件": "preferred", preferred: "preferred",
    "必要資格": "required_qualifications", required_qualifications: "required_qualifications",
    "福利厚生": "benefits", benefits: "benefits",
    "キーワード": "keywords", keywords: "keywords",
    "ステータス": "status", status: "status",
    "外部ID": "external_id", external_id: "external_id",
    "備考": "notes", notes: "notes",
  };

  const { data: companies } = await db.from("companies").select("id, name");
  const companyMap = new Map<string, string>();
  for (const c of companies || []) companyMap.set((c.name as string).toLowerCase(), c.id as string);

  const arrayFields = new Set(["requirements", "preferred", "required_qualifications", "keywords"]);
  const intFields = new Set(["salary_min", "salary_max"]);

  let created = 0, updated = 0;
  const errors: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    const raw = rows[i];
    const mapped: Record<string, unknown> = {};
    let companyName = "";

    for (const [key, val] of Object.entries(raw)) {
      const col = headerMap[key.trim()];
      if (!col) continue;
      const v = typeof val === "string" ? val.trim() : val;
      if (!v) continue;
      if (col === "_company_name") { companyName = v as string; continue; }
      if (arrayFields.has(col)) {
        mapped[col] = (v as string).split(/[,、;；]/).map((s: string) => s.trim()).filter(Boolean);
      } else if (intFields.has(col)) {
        const n = parseInt(v as string, 10);
        if (!isNaN(n)) mapped[col] = n;
      } else {
        mapped[col] = v;
      }
    }

    if (!mapped.title) { errors.push(`行${i + 1}: タイトルが空です`); continue; }
    if (companyName) {
      const cid = companyMap.get(companyName.toLowerCase());
      if (cid) mapped.company_id = cid;
    }
    mapped.source = "spreadsheet";

    if (mapped.external_id) {
      const { data: existing } = await db.from("job_postings").select("id").eq("external_id", mapped.external_id).maybeSingle();
      if (existing) { await db.from("job_postings").update(mapped).eq("id", existing.id); updated++; continue; }
    }

    const { error } = await db.from("job_postings").insert(mapped);
    if (error) errors.push(`行${i + 1}: ${error.message}`); else created++;
  }

  return res.json({ created, updated, errors, total: rows.length });
}

async function matchJobs(db: ReturnType<typeof getSupabaseAdmin>, req: VercelRequest, res: VercelResponse) {
  const { candidate_id, keywords: rawKeywords } = req.body;
  let queryKws: string[] = [];

  if (candidate_id) {
    const { data: candidate, error } = await db
      .from("candidates")
      .select("desired_keywords, desired_position, desired_location, current_industry, qualifications")
      .eq("id", candidate_id).single();
    if (error || !candidate) return res.status(404).json({ error: "候補者が見つかりません" });
    queryKws = [
      ...((candidate.desired_keywords as string[]) || []),
      ...((candidate.qualifications as string[]) || []),
    ];
    if (candidate.desired_position) queryKws.push(candidate.desired_position as string);
    if (candidate.current_industry) queryKws.push(candidate.current_industry as string);
  } else if (rawKeywords && Array.isArray(rawKeywords)) {
    queryKws = rawKeywords;
  } else {
    return res.status(400).json({ error: "candidate_id または keywords が必要です" });
  }

  queryKws = queryKws.map((k) => k.trim().toLowerCase()).filter(Boolean);
  if (queryKws.length === 0) return res.json({ results: [], total: 0, query_keywords: [] });

  const { data: jobs } = await db.from("job_postings").select("*, companies(id, name)").eq("status", "open").order("created_at", { ascending: false });
  if (!jobs) return res.json({ results: [], total: 0, query_keywords: queryKws });

  const results: Array<Record<string, unknown>> = [];
  for (const job of jobs) {
    const jobKws: string[] = [
      ...((job.keywords as string[]) || []),
      ...((job.requirements as string[]) || []),
      ...((job.required_qualifications as string[]) || []),
    ].map((k) => k.toLowerCase());
    if (job.position_type) jobKws.push((job.position_type as string).toLowerCase());
    if (job.location) jobKws.push((job.location as string).toLowerCase());
    if (job.title) jobKws.push((job.title as string).toLowerCase());

    const hits = queryKws.filter((kw) => jobKws.some((jk) => jk.includes(kw) || kw.includes(jk)));
    if (hits.length === 0) continue;
    results.push({ job, matched_keywords: hits, match_score: hits.length });
  }
  results.sort((a, b) => (b.match_score as number) - (a.match_score as number));
  return res.json({ results, total: results.length, query_keywords: queryKws });
}
