/**
 * Consolidated RA prospecting API (Hobby plan: 1 function).
 *
 *   POST /api/ra/import             seed CSV/JSON → ra_companies + ra_candidates
 *   POST /api/ra/crawl              ra_companies → fetchPage → Gemini extract → ra_jobs upsert
 *   POST /api/ra/match              open ra_jobs × ra_candidates → Gemini score → ra_matches
 *   POST /api/ra/discover           Gemini suggest new companies → ra_discovery_queue
 *   POST /api/ra/activity           activity log → ra_activities
 *   POST /api/ra/find-recruit-url   Gemini guesses recruit-page URL for a company name
 *   POST /api/ra/approve-discovery  promote a queued discovery row into ra_companies
 *   POST /api/ra/update-company     PATCH name / contact_paths / notes / recruit_page_url
 *   POST /api/ra/update-candidate   PATCH candidate profile
 *   POST /api/ra/cron               crawl + match + optional Lark notify (Vercel Cron)
 *   GET  /api/ra/cron               same — Vercel Cron sends GET
 *
 * Auth: either `?secret=$CRON_SECRET` / `Authorization: Bearer $CRON_SECRET`
 *       OR a valid Supabase user session token (Authorization: Bearer <jwt>).
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { getSupabaseAdmin } from "../_lib/supabase-admin.js";
import { parseCsv } from "../_lib/ra-csv.js";
import { generateJson, geminiModel, hasGemini } from "../_lib/ra-gemini.js";
import { fetchPage, sha256 } from "../_lib/ra-scrape.js";

// Vercel function timeout — Hobby plan caps at 60s, Pro at 300s.
// Crawl + match can be heavy; opt into the full budget.
export const config = { maxDuration: 60 };

type DB = ReturnType<typeof getSupabaseAdmin>;

async function authorize(req: VercelRequest, db: DB): Promise<{ ok: true } | { ok: false; status: number; body: object }> {
  const secret = process.env.CRON_SECRET;
  const bearer = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
  const querySecret = typeof req.query.secret === "string" ? req.query.secret : "";

  // 1) Shared-secret path (cron / curl).
  if (secret && (querySecret === secret || bearer === secret)) return { ok: true };

  // 2) Supabase user session path (browser).
  if (bearer) {
    try {
      const { data, error } = await db.auth.getUser(bearer);
      if (!error && data?.user) return { ok: true };
    } catch {
      // fall through to 401
    }
  }
  return { ok: false, status: 401, body: { error: "unauthorized" } };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const db = getSupabaseAdmin();
  const auth = await authorize(req, db);
  if (!auth.ok) return res.status(auth.status).json(auth.body);

  const segments: string[] = Array.isArray(req.query.path)
    ? req.query.path
    : req.query.path
      ? [req.query.path]
      : [];
  const sub = segments[0] ?? "";

  try {
    switch (sub) {
      case "import":            return await importSeed(db, req, res);
      case "crawl":             return await crawl(db, req, res);
      case "match":             return await match(db, req, res);
      case "discover":          return await discover(db, req, res);
      case "activity":          return await activity(db, req, res);
      case "find-recruit-url":  return await findRecruitUrl(db, req, res);
      case "find-contact-info": return await findContactInfo(db, req, res);
      case "add-companies":     return await addCompanies(db, req, res);
      case "add-candidate":     return await addCandidate(db, req, res);
      case "approve-discovery": return await approveDiscovery(db, req, res);
      case "update-company":    return await updateCompany(db, req, res);
      case "update-candidate":  return await updateCandidate(db, req, res);
      case "cron":              return await cron(db, req, res);
      default:                  return res.status(404).json({ error: "unknown RA endpoint" });
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
  const r = await runCrawl(db, {
    limit: Number(req.query.limit ?? 10),
    companyId: typeof req.query.company_id === "string" ? req.query.company_id : null,
  });
  return res.json(r);
}

/**
 * Run N async functions over an array with bounded concurrency.
 * Lets us fan out crawl/match work without overwhelming Gemini's 15 RPM
 * free-tier ceiling. We pick the concurrency cap based on realistic
 * Gemini latency (~3–5s per call) so 5-way × ~4s ≈ 75 RPM peak, but each
 * call takes >4s so effective rate is ~12-15 RPM.
 */
async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length || 1) }, () => worker()),
  );
  return results;
}

async function runCrawl(db: DB, opts: { limit: number; companyId: string | null }) {
  let q = db.from("ra_companies").select("*").not("recruit_page_url", "is", null).order("last_crawled_at", { ascending: true, nullsFirst: true }).limit(opts.limit);
  if (opts.companyId) q = q.eq("id", opts.companyId);
  const { data: companies, error } = await q;
  if (error) throw new Error(error.message);

  const stats = { crawled: 0, newJobs: 0, updatedJobs: 0, errors: 0 };
  const errors: string[] = [];

  await mapWithConcurrency(companies ?? [], 5, async (c) => {
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
  });

  await db.from("ra_crawl_runs").insert({
    kind: "crawl", finished_at: new Date().toISOString(),
    ok: stats.errors === 0, stats: { ...stats, model: geminiModel }, error: errors.join(" | ") || null,
  });
  return { ok: true, ...stats, errors };
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
  const r = await runMatch(db, {
    limit: Number(req.query.limit ?? 20),
    jobId: typeof req.query.job_id === "string" ? req.query.job_id : null,
  });
  return res.json(r);
}

async function runMatch(db: DB, opts: { limit: number; jobId: string | null }) {
  const { data: candidates } = await db.from("ra_candidates").select("*").eq("is_active", true).limit(20);
  const jobsQuery = opts.jobId
    ? db.from("ra_jobs").select("*").eq("id", opts.jobId).limit(1)
    : db.from("ra_jobs").select("*").eq("is_open", true).order("last_seen_at", { ascending: false }).limit(opts.limit);
  const { data: jobs, error } = await jobsQuery;
  if (error) throw new Error(error.message);

  const stats = { scored: 0, skipped: 0, errors: 0 };
  const errors: string[] = [];

  // Cartesian product of jobs × candidates, then run in parallel pool.
  const pairs: Array<{ j: typeof jobs extends Array<infer J> | null ? J : never; c: typeof candidates extends Array<infer C> | null ? C : never }> = [];
  for (const j of jobs ?? []) for (const c of candidates ?? []) pairs.push({ j, c });

  await mapWithConcurrency(pairs, 5, async ({ j, c }) => {
    try {
      const { data: existing } = await db.from("ra_matches").select("id").eq("job_id", j.id).eq("candidate_id", c.id).limit(1);
      if (existing && existing.length > 0) { stats.skipped += 1; return; }
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
  });

  await db.from("ra_crawl_runs").insert({
    kind: "match", finished_at: new Date().toISOString(),
    ok: stats.errors === 0, stats: { ...stats, jobs: jobs?.length ?? 0, candidates: candidates?.length ?? 0, model: geminiModel },
    error: errors.join(" | ") || null,
  });
  return { ok: true, ...stats, errors };
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
async function cron(db: DB, _req: VercelRequest, res: VercelResponse) {
  const started_at = new Date().toISOString();
  // 安全側: 1 cron で 25 社 / 25 求人。2 cron/日 = 50 社/日。
  // 246 社 × 5 日サイクル。Gemini ~ 25 + 25×4 = 125 calls/cron → 250/日 (free 1500/日 の 17%)。
  // これで「無料運用かつ安全マージン」を担保。
  const c = await tryRun(() => runCrawl(db, { limit: 25, companyId: null }));
  const m = await tryRun(() => runMatch(db, { limit: 25, jobId: null }));
  const ok = c.ok && m.ok;
  await db.from("ra_crawl_runs").insert({
    kind: "cron", started_at, finished_at: new Date().toISOString(),
    ok, stats: { crawl: c.body, match: m.body }, error: ok ? null : `${c.error ?? ""} | ${m.error ?? ""}`,
  });
  // Lark / Slack notification — fire-and-forget, never block the cron response.
  notifyAfterCron(db).catch(() => undefined);
  return res.json({ ok, crawl: c.body, match: m.body });
}

async function notifyAfterCron(db: DB) {
  const webhook = process.env.LARK_WEBHOOK_URL || process.env.SLACK_WEBHOOK_URL;
  if (!webhook) return;
  const { data: rows } = await db.from("ra_ready_to_execute").select("grade,company_name,candidate_name").limit(500);
  const list = rows ?? [];
  const dbl = list.filter((r) => r.grade === "◎").length;
  const cir = list.filter((r) => r.grade === "○").length;
  const top = list.slice(0, 5).map((r) => `• ${r.grade} ${r.company_name} → ${r.candidate_name}`).join("\n");
  const text = `🌅 *RA 新規開拓 / 朝の実行待ち*\n◎ ${dbl}件 / ○ ${cir}件\n\n${top}\n\n全件: /ra/ready`;
  // Lark webhook supports {msg_type:"text", content:{text}}; Slack supports {text}.
  const body = webhook.includes("larksuite") || webhook.includes("feishu")
    ? { msg_type: "text", content: { text } }
    : { text };
  await fetch(webhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).catch(() => undefined);
}

// ---------------------------------------------------------------------------
// /api/ra/find-recruit-url  — Gemini guesses the careers-page URL for a name
// ---------------------------------------------------------------------------
async function findRecruitUrl(db: DB, req: VercelRequest, res: VercelResponse) {
  if (!hasGemini) return res.status(412).json({ error: "GEMINI_API_KEY not configured" });
  const body = (req.body ?? {}) as { company_id?: string; name?: string };
  let name = body.name;
  if (!name && body.company_id) {
    const { data } = await db.from("ra_companies").select("name").eq("id", body.company_id).maybeSingle();
    name = data?.name as string | undefined;
  }
  if (!name) return res.status(400).json({ error: "name or company_id required" });

  const prompt = `日本企業「${name}」の **採用ページ** (新卒/中途どちらでも可) の URL を 1 つだけ推定してください。
コーポレートサイト内の /recruit/ や /careers/ 等が一般的です。
**確証が無い場合は null を返す** こと。事実に基づき、推測で URL をでっち上げないこと。

JSON のみ:
{ "url": "https://...  | null", "corporate_url": "https://... | null", "confidence": 0-1, "note": "..." }`;
  const parsed = await generateJson<{ url: string | null; corporate_url: string | null; confidence: number; note?: string }>(prompt, { temperature: 0.1 });

  if (body.company_id && parsed.url) {
    await db.from("ra_companies").update({
      recruit_page_url: parsed.url,
      corporate_url: parsed.corporate_url ?? undefined,
    }).eq("id", body.company_id);
  }
  return res.json({ ok: true, ...parsed });
}

// ---------------------------------------------------------------------------
// /api/ra/find-contact-info — corporate + recruit + contact form + email + linkedin
// ---------------------------------------------------------------------------
async function findContactInfo(db: DB, req: VercelRequest, res: VercelResponse) {
  if (!hasGemini) return res.status(412).json({ error: "GEMINI_API_KEY not configured" });
  const body = (req.body ?? {}) as { company_id?: string; name?: string };
  let name = body.name;
  if (!name && body.company_id) {
    const { data } = await db.from("ra_companies").select("name").eq("id", body.company_id).maybeSingle();
    name = data?.name as string | undefined;
  }
  if (!name) return res.status(400).json({ error: "name or company_id required" });

  const prompt = `日本企業「${name}」について、以下 5 種類の URL / 情報を可能な限り推定。
**確証が無いものは null** にする。推測で URL をでっち上げないこと。

JSON のみ:
{
  "corporate_url":    "https://...  | null",
  "recruit_page_url": "https://...  | null",
  "contact_form_url": "https://...  | null",
  "contact_email":    "info@... | null",
  "linkedin_url":     "https://www.linkedin.com/company/... | null",
  "confidence": 0-1,
  "note": "判断根拠を 1 文で"
}`;
  const parsed = await generateJson<{
    corporate_url: string | null;
    recruit_page_url: string | null;
    contact_form_url: string | null;
    contact_email: string | null;
    linkedin_url: string | null;
    confidence: number;
    note?: string;
  }>(prompt, { temperature: 0.1 });

  if (body.company_id) {
    // Merge into contact_paths jsonb and set top-level URLs.
    const { data: cur } = await db.from("ra_companies").select("contact_paths").eq("id", body.company_id).maybeSingle();
    const existing = Array.isArray(cur?.contact_paths) ? cur!.contact_paths : [];
    const next = [...existing];
    const upsertPath = (kind: string, url: string | null) => {
      if (!url) return;
      if (next.find((p: { kind?: string; url?: string }) => p.kind === kind && p.url === url)) return;
      next.push({ kind, url });
    };
    upsertPath("form",     parsed.contact_form_url);
    upsertPath("email",    parsed.contact_email);
    upsertPath("linkedin", parsed.linkedin_url);

    const patch: Record<string, unknown> = { contact_paths: next, updated_at: new Date().toISOString() };
    if (parsed.recruit_page_url) patch.recruit_page_url = parsed.recruit_page_url;
    if (parsed.corporate_url)    patch.corporate_url    = parsed.corporate_url;
    await db.from("ra_companies").update(patch).eq("id", body.company_id);
  }
  return res.json({ ok: true, ...parsed });
}

// ---------------------------------------------------------------------------
// /api/ra/add-companies — bulk add via inline JSON (CSV-paste-friendly)
// ---------------------------------------------------------------------------
async function addCompanies(db: DB, req: VercelRequest, res: VercelResponse) {
  const body = (req.body ?? {}) as {
    rows?: Array<{
      name: string;
      category?: string | null;
      priority?: string;
      recruit_page_url?: string | null;
      corporate_url?: string | null;
      location?: string | null;
      employee_size?: string | null;
      notes?: string | null;
    }>;
  };
  const rows = Array.isArray(body.rows) ? body.rows.filter((r) => r?.name) : [];
  if (rows.length === 0) return res.status(400).json({ error: "rows required (must include name)" });

  const payload = rows.map((r) => ({
    name: r.name.trim(),
    category: r.category ?? null,
    priority: (r.priority ?? "B").toUpperCase(),
    recruit_page_url: r.recruit_page_url ?? null,
    corporate_url: r.corporate_url ?? null,
    location: r.location ?? null,
    employee_size: r.employee_size ?? null,
    notes: r.notes ?? null,
    source: "manual",
  }));

  const { data, error } = await db
    .from("ra_companies")
    .upsert(payload, { onConflict: "name", ignoreDuplicates: false })
    .select("id,name");
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ ok: true, added: data?.length ?? 0, names: (data ?? []).map((d) => d.name) });
}

// ---------------------------------------------------------------------------
// /api/ra/add-candidate — create a new candidate row
// ---------------------------------------------------------------------------
async function addCandidate(db: DB, req: VercelRequest, res: VercelResponse) {
  const body = (req.body ?? {}) as {
    code?: string;
    name?: string;
    headline?: string | null;
    profile?: Record<string, unknown>;
    is_active?: boolean;
  };
  if (!body.code || !body.name) {
    return res.status(400).json({ error: "code and name required" });
  }
  const { data, error } = await db.from("ra_candidates").insert({
    code: body.code.trim(),
    name: body.name.trim(),
    headline: body.headline ?? null,
    profile: body.profile ?? {},
    is_active: body.is_active ?? true,
  }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ ok: true, candidate: data });
}

// ---------------------------------------------------------------------------
// /api/ra/approve-discovery  — promote queue row → ra_companies
// ---------------------------------------------------------------------------
async function approveDiscovery(db: DB, req: VercelRequest, res: VercelResponse) {
  const body = (req.body ?? {}) as { id?: string; reject?: boolean; priority?: string };
  if (!body.id) return res.status(400).json({ error: "id required" });

  const { data: row, error } = await db.from("ra_discovery_queue").select("*").eq("id", body.id).maybeSingle();
  if (error || !row) return res.status(404).json({ error: "discovery row not found" });

  if (body.reject) {
    await db.from("ra_discovery_queue").update({ status: "rejected", reviewed_at: new Date().toISOString() }).eq("id", body.id);
    return res.json({ ok: true, status: "rejected" });
  }

  const { data: ins, error: e2 } = await db.from("ra_companies").insert({
    name: row.name,
    category: row.category,
    priority: body.priority ?? "B",
    recruit_page_url: null,
    corporate_url: row.hint_url,
    source: "discovery",
    notes: row.reason,
  }).select("id").single();
  if (e2) return res.status(500).json({ error: e2.message });

  await db.from("ra_discovery_queue").update({
    status: "promoted",
    reviewed_at: new Date().toISOString(),
    promoted_company_id: ins.id,
  }).eq("id", body.id);

  return res.json({ ok: true, status: "promoted", company_id: ins.id });
}

// ---------------------------------------------------------------------------
// /api/ra/update-company  — PATCH metadata
// ---------------------------------------------------------------------------
async function updateCompany(db: DB, req: VercelRequest, res: VercelResponse) {
  const body = (req.body ?? {}) as {
    id?: string;
    name?: string;
    category?: string | null;
    priority?: string;
    recruit_page_url?: string | null;
    corporate_url?: string | null;
    contact_paths?: unknown;
    notes?: string | null;
  };
  if (!body.id) return res.status(400).json({ error: "id required" });

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const k of ["name", "category", "priority", "recruit_page_url", "corporate_url", "contact_paths", "notes"] as const) {
    if (body[k] !== undefined) patch[k] = body[k];
  }
  const { data, error } = await db.from("ra_companies").update(patch).eq("id", body.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ ok: true, company: data });
}

// ---------------------------------------------------------------------------
// /api/ra/update-candidate  — PATCH profile / headline / is_active
// ---------------------------------------------------------------------------
async function updateCandidate(db: DB, req: VercelRequest, res: VercelResponse) {
  const body = (req.body ?? {}) as {
    id?: string;
    headline?: string | null;
    profile?: Record<string, unknown>;
    is_active?: boolean;
  };
  if (!body.id) return res.status(400).json({ error: "id required" });
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.headline !== undefined) patch.headline = body.headline;
  if (body.profile  !== undefined) patch.profile = body.profile;
  if (body.is_active !== undefined) patch.is_active = body.is_active;
  const { data, error } = await db.from("ra_candidates").update(patch).eq("id", body.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ ok: true, candidate: data });
}

async function tryRun(fn: () => Promise<unknown>) {
  try { return { ok: true, body: await fn(), error: null }; }
  catch (err) { return { ok: false, body: null, error: (err as Error).message }; }
}
