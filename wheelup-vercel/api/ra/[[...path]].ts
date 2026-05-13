/**
 * Consolidated RA prospecting API (Hobby plan: 1 function).
 *
 *   POST /api/ra/import     seed CSV/JSON → ra_companies + ra_candidates
 *   POST /api/ra/crawl      ra_companies → fetchPage → Gemini extract → ra_jobs upsert
 *   POST /api/ra/match      open ra_jobs × ra_candidates → Gemini score → ra_matches
 *   POST /api/ra/discover   Gemini suggest new companies → ra_discovery_queue
 *   POST /api/ra/activity   activity log → ra_activities
 *   POST /api/ra/cron       crawl + match in one call (Vercel Cron)
 *   GET  /api/ra/cron       (same — Vercel Cron sends GET)
 *
 * All endpoints require `?secret=$CRON_SECRET` OR `Authorization: Bearer $CRON_SECRET`.
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { getSupabaseAdmin } from "../_lib/supabase-admin.js";
import { parseCsv } from "../_lib/ra-csv.js";
import { generateJson, geminiModel, hasGemini } from "../_lib/ra-gemini.js";
import { fetchPage, sha256 } from "../_lib/ra-scrape.js";

type DB = ReturnType<typeof getSupabaseAdmin>;

function authorize(req: VercelRequest): { ok: true } | { ok: false; status: number; body: object } {
  const expected = process.env.CRON_SECRET;
  if (!expected) return { ok: false, status: 500, body: { error: "CRON_SECRET not configured" } };
  const provided =
    (typeof req.query.secret === "string" && req.query.secret) ||
    (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "") ||
    "";
  if (provided !== expected) return { ok: false, status: 401, body: { error: "unauthorized" } };
  return { ok: true };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const auth = authorize(req);
  if (!auth.ok) return res.status(auth.status).json(auth.body);

  const segments: string[] = Array.isArray(req.query.path)
    ? req.query.path
    : req.query.path
      ? [req.query.path]
      : [];
  const sub = segments[0] ?? "";

  const db = getSupabaseAdmin();
  try {
    switch (sub) {
      case "import":   return await importSeed(db, req, res);
      case "crawl":    return await crawl(db, req, res);
      case "match":    return await match(db, req, res);
      case "discover": return await discover(db, req, res);
      case "activity": return await activity(db, req, res);
      case "cron":     return await cron(db, req, res);
      default:         return res.status(404).json({ error: "unknown RA endpoint" });
    }
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message });
  }
}

// ---------------------------------------------------------------------------
// /api/ra/import
// ---------------------------------------------------------------------------
async function importSeed(db: DB, _req: VercelRequest, res: VercelResponse) {
  // Vercel bundles files referenced via path.join — we put the seed under public/ra/
  // and ALSO under api/_data/ to ensure they're included in the function bundle.
  const dataDir = path.join(process.cwd(), "api", "_data");

  const csv = await readFile(path.join(dataDir, "companies_seed.csv"), "utf8");
  const rows = parseCsv(csv);
  const companies = rows.map((r) => ({
    name: r.name,
    category: r.category || null,
    priority: (r.priority || "B").toUpperCase(),
    recruit_page_url: r.recruit_page_url || null,
    corporate_url: r.corporate_url || null,
    location: r.location || null,
    employee_size: r.employee_size || null,
    notes: r.notes || null,
    source: "seed",
  }));
  const { data: insCo, error: e1 } = await db
    .from("ra_companies")
    .upsert(companies, { onConflict: "name", ignoreDuplicates: false })
    .select("id");
  if (e1) throw new Error(`upsert ra_companies: ${e1.message}`);

  const candJson = await readFile(path.join(dataDir, "candidates_seed.json"), "utf8");
  const cands = (JSON.parse(candJson) as Array<{
    code: string; name: string; headline?: string; profile: Record<string, unknown>;
  }>).map((c) => ({
    code: c.code,
    name: c.name,
    headline: c.headline ?? null,
    profile: c.profile,
  }));
  const { data: insCa, error: e2 } = await db
    .from("ra_candidates")
    .upsert(cands, { onConflict: "code", ignoreDuplicates: false })
    .select("id");
  if (e2) throw new Error(`upsert ra_candidates: ${e2.message}`);

  return res.json({ ok: true, companies: insCo?.length ?? 0, candidates: insCa?.length ?? 0 });
}

// ---------------------------------------------------------------------------
// /api/ra/crawl
// ---------------------------------------------------------------------------
async function crawl(db: DB, req: VercelRequest, res: VercelResponse) {
  const limit = Number(req.query.limit ?? 10);
  const companyId = typeof req.query.company_id === "string" ? req.query.company_id : null;

  let q = db.from("ra_companies").select("*").not("recruit_page_url", "is", null).order("last_crawled_at", { ascending: true, nullsFirst: true }).limit(limit);
  if (companyId) q = q.eq("id", companyId);
  const { data: companies, error } = await q;
  if (error) throw new Error(error.message);

  const stats = { crawled: 0, newJobs: 0, updatedJobs: 0, errors: 0 };
  const errors: string[] = [];

  for (const c of companies ?? []) {
    try {
      const body = await fetchPage(c.recruit_page_url as string);
      const extracted = await extractJobs(c.name as string, body);
      for (const j of extracted) {
        const hash = sha256(`${j.title}\n${j.description ?? ""}\n${j.requirements ?? ""}`);
        const { data: existing } = await db.from("ra_jobs").select("id").eq("company_id", c.id).eq("content_hash", hash).limit(1);
        if (!existing || existing.length === 0) {
          await db.from("ra_jobs").insert({
            company_id: c.id,
            title: j.title,
            description: j.description ?? null,
            requirements: j.requirements ?? null,
            employment_type: j.employment_type ?? null,
            location: j.location ?? null,
            salary_range: j.salary_range ?? null,
            url: j.url ?? c.recruit_page_url,
            content_hash: hash,
            is_open: true,
            raw: j,
          });
          stats.newJobs += 1;
        } else {
          await db.from("ra_jobs").update({ last_seen_at: new Date().toISOString(), is_open: true }).eq("id", existing[0].id);
          stats.updatedJobs += 1;
        }
      }
      await db.from("ra_companies").update({ last_crawled_at: new Date().toISOString() }).eq("id", c.id);
      stats.crawled += 1;
    } catch (err) {
      stats.errors += 1;
      errors.push(`${c.name}: ${(err as Error).message}`);
    }
  }

  await db.from("ra_crawl_runs").insert({
    kind: "crawl", finished_at: new Date().toISOString(),
    ok: stats.errors === 0, stats: { ...stats, model: geminiModel }, error: errors.join(" | ") || null,
  });
  return res.json({ ok: true, ...stats, errors });
}

type ExtractedJob = {
  title: string; description?: string; requirements?: string;
  employment_type?: string; location?: string; salary_range?: string; url?: string;
};

async function extractJobs(companyName: string, body: string): Promise<ExtractedJob[]> {
  if (!hasGemini) return [];
  const prompt = `You are reading the careers page of "${companyName}" (a Japanese firm in the FM/PM/建築設備/施設管理/ゼネコン space). Extract every currently-open job listing in the text below.

Return STRICT JSON:
{
  "jobs": [
    {
      "title": "string",
      "description": "string (short)",
      "requirements": "string (1-3 sentences)",
      "employment_type": "正社員 | 契約 | null",
      "location": "string | null",
      "salary_range": "string | null",
      "url": "string | null"
    }
  ]
}

If you can't find concrete openings, return {"jobs": []}.

--- PAGE TEXT ---
${body.slice(0, 20000)}`;
  const parsed = await generateJson<{ jobs: ExtractedJob[] }>(prompt);
  return Array.isArray(parsed?.jobs) ? parsed.jobs : [];
}

// ---------------------------------------------------------------------------
// /api/ra/match
// ---------------------------------------------------------------------------
async function match(db: DB, req: VercelRequest, res: VercelResponse) {
  const limit = Number(req.query.limit ?? 20);
  const jobId = typeof req.query.job_id === "string" ? req.query.job_id : null;

  const { data: candidates } = await db.from("ra_candidates").select("*").eq("is_active", true).limit(20);
  const jobsQuery = jobId
    ? db.from("ra_jobs").select("*").eq("id", jobId).limit(1)
    : db.from("ra_jobs").select("*").eq("is_open", true).order("last_seen_at", { ascending: false }).limit(limit);
  const { data: jobs, error } = await jobsQuery;
  if (error) throw new Error(error.message);

  const stats = { scored: 0, skipped: 0, errors: 0 };
  const errors: string[] = [];

  for (const j of jobs ?? []) {
    for (const c of candidates ?? []) {
      try {
        const { data: existing } = await db.from("ra_matches").select("id").eq("job_id", j.id).eq("candidate_id", c.id).limit(1);
        if (existing && existing.length > 0) { stats.skipped += 1; continue; }
        const s = await scoreOne(j, c);
        await db.from("ra_matches").insert({
          job_id: j.id, candidate_id: c.id,
          grade: s.grade, score: s.score, reasons: s.reasons, concerns: s.concerns, model: geminiModel,
        });
        stats.scored += 1;
      } catch (err) {
        stats.errors += 1;
        errors.push(`${j.title} × ${c.name}: ${(err as Error).message}`);
      }
    }
  }

  await db.from("ra_crawl_runs").insert({
    kind: "match", finished_at: new Date().toISOString(),
    ok: stats.errors === 0, stats: { ...stats, jobs: jobs?.length ?? 0, candidates: candidates?.length ?? 0, model: geminiModel },
    error: errors.join(" | ") || null,
  });
  return res.json({ ok: true, ...stats, errors });
}

type Scored = { grade: "◎" | "○" | "△" | "×"; score: number; reasons: string[]; concerns: string[] };

async function scoreOne(job: Record<string, unknown>, candidate: Record<string, unknown>): Promise<Scored> {
  if (!hasGemini) return { grade: "△", score: 50, reasons: ["mock"], concerns: ["GEMINI_API_KEY未設定"] };
  const prompt = `あなたは建築設備 / FM / PM / 施設管理 領域の日本のRAです。以下の求人 × 候補者の相性を ◎ ○ △ × で判定し、0-100点を付けてください。

# 候補者
名前: ${candidate.name}
ヘッドライン: ${candidate.headline ?? ""}
プロフィール:
${JSON.stringify(candidate.profile, null, 2)}

# 求人
タイトル: ${job.title}
雇用形態: ${job.employment_type ?? ""}
勤務地: ${job.location ?? ""}
想定年収: ${job.salary_range ?? ""}
説明: ${job.description ?? ""}
必須要件: ${job.requirements ?? ""}

# 判定基準
- ◎ = ほぼ確実にマッチ
- ○ = 強くマッチ
- △ = 接戦
- × = 不適合（deal_breakers 抵触 等）

# 出力(JSON のみ)
{ "grade": "...", "score": 0-100, "reasons": ["..."], "concerns": ["..."] }`;
  const parsed = await generateJson<Scored>(prompt);
  const g = parsed.grade ?? "△";
  return {
    grade: (["◎","○","△","×"] as const).includes(g as never) ? g : "△",
    score: Math.max(0, Math.min(100, Number(parsed.score) || 0)),
    reasons: Array.isArray(parsed.reasons) ? parsed.reasons.slice(0, 6) : [],
    concerns: Array.isArray(parsed.concerns) ? parsed.concerns.slice(0, 6) : [],
  };
}

// ---------------------------------------------------------------------------
// /api/ra/discover
// ---------------------------------------------------------------------------
async function discover(db: DB, req: VercelRequest, res: VercelResponse) {
  if (!hasGemini) return res.status(412).json({ error: "GEMINI_API_KEY not configured" });
  const want = Number(req.query.count ?? 10);

  const { data: known } = await db.from("ra_companies").select("name").limit(1000);
  const knownNames = (known ?? []).map((c: { name: string }) => c.name);

  const prompt = `あなたは日本の建築設備 / FM / PM / 施設管理 / ゼネコン業界に詳しいリサーチャーです。
既に下記の企業はターゲットリストに入っています:
${knownNames.join(", ")}

これら**以外**で、同じ領域の有力企業を ${want} 社、新規に提案してください。

JSON のみ:
{ "suggestions": [ { "name": "...", "category": "FM|PM|建築設備|施設管理|ゼネコン|サブコン", "reason": "...", "hint_url": "..." } ] }`;
  const parsed = await generateJson<{ suggestions: { name: string; category?: string; reason?: string; hint_url?: string }[] }>(prompt, { temperature: 0.4 });
  const suggestions = parsed.suggestions ?? [];

  const seen = new Set(knownNames);
  const toInsert = suggestions
    .filter((s) => s.name && !seen.has(s.name))
    .map((s) => ({
      name: s.name, reason: s.reason ?? null, hint_url: s.hint_url ?? null,
      category: s.category ?? null, status: "pending", raw: s,
    }));

  if (toInsert.length > 0) await db.from("ra_discovery_queue").insert(toInsert);
  await db.from("ra_crawl_runs").insert({
    kind: "discover", finished_at: new Date().toISOString(),
    ok: true, stats: { suggested: suggestions.length, queued: toInsert.length, model: geminiModel },
  });
  return res.json({ ok: true, suggested: suggestions.length, queued: toInsert.length });
}

// ---------------------------------------------------------------------------
// /api/ra/activity
// ---------------------------------------------------------------------------
async function activity(db: DB, req: VercelRequest, res: VercelResponse) {
  const p = (req.body ?? {}) as {
    company_id?: string | null; job_id?: string | null; candidate_id?: string | null;
    kind?: string; channel?: string | null; body?: string | null;
    meta?: Record<string, unknown>; occurred_at?: string; created_by?: string;
  };
  if (!p.kind) return res.status(400).json({ error: "kind required" });
  const { data, error } = await db.from("ra_activities").insert({
    company_id: p.company_id ?? null, job_id: p.job_id ?? null, candidate_id: p.candidate_id ?? null,
    kind: p.kind, channel: p.channel ?? null, body: p.body ?? null, meta: p.meta ?? {},
    occurred_at: p.occurred_at ?? new Date().toISOString(), created_by: p.created_by ?? null,
  }).select().single();
  if (error) throw new Error(error.message);
  return res.json({ ok: true, activity: data });
}

// ---------------------------------------------------------------------------
// /api/ra/cron — crawl + match
// ---------------------------------------------------------------------------
async function cron(db: DB, req: VercelRequest, res: VercelResponse) {
  const started_at = new Date().toISOString();
  const c = await tryRun(() => crawlInternal(db));
  const m = await tryRun(() => matchInternal(db));
  const ok = c.ok && m.ok;
  await db.from("ra_crawl_runs").insert({
    kind: "cron", started_at, finished_at: new Date().toISOString(),
    ok, stats: { crawl: c.body, match: m.body }, error: ok ? null : `${c.error ?? ""} | ${m.error ?? ""}`,
  });
  return res.json({ ok, crawl: c.body, match: m.body });
}

async function tryRun(fn: () => Promise<unknown>) {
  try { return { ok: true, body: await fn(), error: null }; }
  catch (err) { return { ok: false, body: null, error: (err as Error).message }; }
}

async function crawlInternal(db: DB) {
  const reqLike = { query: { limit: "20" } } as unknown as VercelRequest;
  const recorder: { body?: unknown } = {};
  const resLike = {
    json(b: unknown) { recorder.body = b; return resLike; },
    status() { return resLike; },
  } as unknown as VercelResponse;
  await crawl(db, reqLike, resLike);
  return recorder.body;
}
async function matchInternal(db: DB) {
  const reqLike = { query: { limit: "20" } } as unknown as VercelRequest;
  const recorder: { body?: unknown } = {};
  const resLike = {
    json(b: unknown) { recorder.body = b; return resLike; },
    status() { return resLike; },
  } as unknown as VercelResponse;
  await match(db, reqLike, resLike);
  return recorder.body;
}
