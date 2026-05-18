/**
 * Consolidated RA prospecting API (Hobby plan: 1 function).
 *
 *   POST /api/ra/import             seed CSV/JSON → ra_companies + ra_candidates
 *   POST /api/ra/enrich             URL未設定の会社を Gemini で一括補完
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

import { getSupabaseAdmin } from "../_lib/supabase-admin.js";
import { parseCsv } from "../_lib/ra-csv.js";
import { generateJson, geminiModel, hasGemini } from "../_lib/ra-gemini.js";
import { fetchPage, sha256, urlExists } from "../_lib/ra-scrape.js";
import { googleSearch, hasGoogleSearch } from "../_lib/ra-search.js";

// Vercel function timeout — Hobby plan caps at 60s, Pro at 300s.
// Crawl + match can be heavy; opt into the full budget.
export const config = { maxDuration: 60 };

type DB = ReturnType<typeof getSupabaseAdmin>;

async function authorize(req: VercelRequest, db: DB): Promise<{ ok: true } | { ok: false; status: number; body: object }> {
  // すべての値で trim() を実行。Vercel env / curl での貼り付け時に
  // 前後にタブや改行が混入するケースに対する防御。
  const secret = (process.env.CRON_SECRET ?? "").trim();
  const bearer = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "").trim();
  const querySecret = (typeof req.query.secret === "string" ? req.query.secret : "").trim();

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

  // 失敗時、ハマったときに切り分けやすいよう reason を返す。
  // セキュリティ上、シークレット自体は絶対に返さない。先頭・末尾の数文字と長さだけ。
  const obs = (s: string | undefined | null) => {
    if (!s) return null;
    const len = s.length;
    if (len <= 8) return { len, head: "***", tail: "***" };
    return { len, head: s.slice(0, 4), tail: s.slice(-4) };
  };
  const reason =
    !secret              ? "CRON_SECRET env not set on server" :
    !bearer && !querySecret ? "no credential sent (need Authorization: Bearer or ?secret=)" :
                              "credential present but does not match CRON_SECRET";
  return {
    ok: false, status: 401,
    body: {
      error: "unauthorized",
      reason,
      hints: {
        env_secret: obs(secret ?? ""),       // null = env 未設定
        sent_bearer: obs(bearer),            // null = ヘッダ無し
        sent_query:  obs(querySecret),       // null = ?secret 無し
      },
    },
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const db = getSupabaseAdmin();
  const auth = await authorize(req, db);
  if (!auth.ok) return res.status(auth.status).json(auth.body);

  // `/api/ra/foo/bar` は vercel.json で `/api/ra?path=foo/bar` にリライトされる。
  // path はクエリ文字列で渡ってくるので、トリム + slash-split で segments 化。
  const rawPath = req.query.path;
  const toSegments = (s: string) => s.split("/").map((x) => x.trim()).filter(Boolean);
  const segments: string[] = Array.isArray(rawPath)
    ? rawPath.flatMap((p) => toSegments(String(p)))
    : typeof rawPath === "string" && rawPath
    ? toSegments(rawPath)
    : [];
  const sub = segments[0] ?? "";

  try {
    switch (sub) {
      case "import":            return await importSeed(db, req, res);
      case "enrich":            return await enrichEndpoint(db, req, res);
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
async function importSeed(db: DB, req: VercelRequest, res: VercelResponse) {
  // Vercel の serverless function は /var/task/ で実行され、api/_data/ の生ファイルは
  // バンドルに含まれないことがある (Vercel が非 .js/.ts を bundling 対象にしない)。
  // そこで /ra/companies_seed.csv は public/ra/ に既に存在し HTTP 200 で配信できているので、
  // 同じドメインから fetch して読む方式に切り替える。
  const host = req.headers.host;
  const proto = (req.headers["x-forwarded-proto"] as string | undefined) ?? "https";
  const base = `${proto}://${host}`;

  const csvRes = await fetch(`${base}/ra/companies_seed.csv`);
  if (!csvRes.ok) throw new Error(`fetch companies_seed.csv: ${csvRes.status}`);
  const csv = await csvRes.text();
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

  const candRes = await fetch(`${base}/ra/candidates_seed.json`);
  if (!candRes.ok) throw new Error(`fetch candidates_seed.json: ${candRes.status}`);
  const candJson = await candRes.text();
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

  await mapWithConcurrency(companies ?? [], 1, async (c) => {
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
  // Few-shot で精度を上げる。日本企業の採用ページに頻出するパターンを 2 例提示。
  const prompt = `You are reading the careers page of "${companyName}" (a Japanese firm in the FM/PM/建築設備/施設管理/ゼネコン space). Extract every currently-open job listing in the text below.

Return STRICT JSON:
{
  "jobs": [
    {
      "title": "string (正式な役職名)",
      "description": "string (業務概要を 1-2 文で)",
      "requirements": "string (必須要件 1-3 文)",
      "employment_type": "正社員 | 契約 | 業務委託 | null",
      "location": "string (都道府県/市区町村 | null)",
      "salary_range": "string (例 '600-900万円' | null)",
      "url": "string (求人詳細URLがあれば | null)"
    }
  ]
}

# 例 1 (典型的な施設管理求人):
{ "jobs": [
  { "title": "ビル設備管理スタッフ", "description": "オフィスビルの空調・電気・給排水設備の日常点検および軽微な修繕対応。", "requirements": "第二種電気工事士 / 危険物乙4 のいずれか保有、設備管理経験3年以上", "employment_type": "正社員", "location": "東京都港区", "salary_range": "400-550万円", "url": null }
]}

# 例 2 (一覧ページで詳細リンクのみのとき):
{ "jobs": [
  { "title": "プロパティマネージャー", "description": "オフィス・商業施設のテナント折衝・収益最大化提案。", "requirements": "宅建士、不動産業界経験5年以上", "employment_type": "正社員", "location": "東京", "salary_range": null, "url": "https://example.co.jp/recruit/pm-2026" }
]}

# ルール:
- 「説明会」「インターン」「学生向け」「過去募集」は除外 — 中途で現役の求人のみ
- 同じタイトルが複数現れたら 1 つにまとめる
- 確証が持てない場合は null にする (推測しない)
- 求人が見当たらないときは {"jobs": []}

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
  // 60s Vercel timeout + Gemini 10 RPM 制限 内に収めるため 20 ペアで打切る
  // (jobs=20×candidates=4=80 を放置するとタイムアウト確実)
  const PAIR_CAP = 20;
  const pairs: Array<{ j: typeof jobs extends Array<infer J> | null ? J : never; c: typeof candidates extends Array<infer C> | null ? C : never }> = [];
  outer: for (const j of jobs ?? []) {
    for (const c of candidates ?? []) {
      pairs.push({ j, c });
      if (pairs.length >= PAIR_CAP) break outer;
    }
  }

  await mapWithConcurrency(pairs, 1, async ({ j, c }) => {
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

  // 既知企業との照合は正規化キーで: 「株式会社/(株)」「 」「・」「-」を除去して小文字化
  // 「株式会社X」と「X 株式会社」、「X コーポレーション」と「Xコーポレーション」を同一視
  const seenKeys = new Set(knownNames.map(normalizeCompanyName));
  const dedupSuggestions: typeof suggestions = [];
  const dedupKeys = new Set<string>();
  for (const s of suggestions) {
    if (!s.name) continue;
    const k = normalizeCompanyName(s.name);
    if (!k || seenKeys.has(k) || dedupKeys.has(k)) continue;
    dedupKeys.add(k);
    dedupSuggestions.push(s);
  }
  const toInsert = dedupSuggestions
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
  // 1 cron 構成: enrich(URL補完) → crawl(求人取得) → match(候補者採点) → 古い求人を閉じる
  //   - enrich 10 社 (~6s)        : 採用URL未設定をAIで補完
  //   - crawl  25 社 (~25s)       : recruit_page_url を Jina+Gemini で巡回
  //   - match  25 求人 (~20s)     : 開いてる求人 × 候補者を ◎○△× 採点
  //   - stale  (~1s)              : 30日 last_seen_at 更新なしの jobs を is_open=false
  // 合計 ~50s で 60s タイムアウトに収まる。
  // Gemini calls/cron: 10 (enrich) + 25 (crawl) + 25-100 (match) = ~150 calls/cron
  //                  × 2 cron/日 = ~300/日 < 無料枠 1500/日 (20%)
  const e = await tryRun(() => runEnrich(db, { limit: 10 }));
  const c = await tryRun(() => runCrawl(db,  { limit: 25, companyId: null }));
  const m = await tryRun(() => runMatch(db,  { limit: 25, jobId: null }));
  const s = await tryRun(() => closeStaleJobs(db, 30));
  const ok = e.ok && c.ok && m.ok && s.ok;
  await db.from("ra_crawl_runs").insert({
    kind: "cron", started_at, finished_at: new Date().toISOString(),
    ok, stats: { enrich: e.body, crawl: c.body, match: m.body, stale: s.body },
    error: ok ? null : `${e.error ?? ""} | ${c.error ?? ""} | ${m.error ?? ""} | ${s.error ?? ""}`,
  });
  // Lark / Slack notification — fire-and-forget, never block the cron response.
  notifyAfterCron(db).catch(() => undefined);
  return res.json({ ok, enrich: e.body, crawl: c.body, match: m.body, stale: s.body });
}

/**
 * 古い求人を自動で閉じる。N 日 last_seen_at が更新されていない open な ra_jobs を
 * is_open=false / closed_at=now にする。これで /ready に古い求人が居座らない。
 */
async function closeStaleJobs(db: DB, days: number) {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await db
    .from("ra_jobs")
    .update({ is_open: false, closed_at: new Date().toISOString() })
    .lt("last_seen_at", cutoff)
    .eq("is_open", true)
    .select("id");
  if (error) throw new Error(error.message);
  return { ok: true, closed: data?.length ?? 0, cutoff };
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

  const result = await enrichOne(db, { id: body.company_id ?? null, name });
  return res.json({ ok: true, ...result });
}

/** Pure helper: ask Gemini for a company's URLs, optionally write back to DB. */
type EnrichResult = {
  corporate_url: string | null;
  recruit_page_url: string | null;
  contact_form_url: string | null;
  contact_email: string | null;
  linkedin_url: string | null;
  confidence: number;
  note?: string;
};

/**
 * 4 層フォールバックで企業 URL を高精度に特定する:
 *   Layer 1: Google Custom Search (公式/採用/問合せ/LinkedIn の 4 クエリ) → Gemini が選別
 *   Layer 2: 2 段階 Gemini (Corp URL → 実 HTML から /recruit /contact を抽出)
 *   Layer 3: パターン総当たり (/recruit, /careers, /採用情報, /contact... + HEAD)
 *   Layer 4: 単発 Gemini (最終フォールバック)
 * 各 URL は最終的に HEAD で検証してから保存。
 */
async function enrichOne(db: DB, target: { id: string | null; name: string }): Promise<EnrichResult> {
  const candidates = { corporate: [] as string[], recruit: [] as string[], contact: [] as string[], linkedin: [] as string[] };
  let contact_email: string | null = null;
  const notes: string[] = [];

  // ── Layer 1: Google Custom Search ─────────────────────────────────
  if (hasGoogleSearch) {
    try {
      const [corpHits, recHits, contactHits, linkedinHits] = await Promise.all([
        googleSearch(`${target.name} 公式サイト`, 5),
        googleSearch(`${target.name} 採用情報 OR 採用 OR careers OR recruit`, 5),
        googleSearch(`${target.name} お問い合わせ OR 問い合わせ OR contact`, 5),
        googleSearch(`site:linkedin.com/company ${target.name}`, 3),
      ]);
      const picked = await pickFromSearchResults(target.name, { corpHits, recHits, contactHits, linkedinHits });
      if (picked.corporate_url)    candidates.corporate.push(picked.corporate_url);
      if (picked.recruit_page_url) candidates.recruit.push(picked.recruit_page_url);
      if (picked.contact_form_url) candidates.contact.push(picked.contact_form_url);
      if (picked.linkedin_url)     candidates.linkedin.push(picked.linkedin_url);
      notes.push("google-search");
    } catch (err) { notes.push(`google-search failed: ${(err as Error).message}`); }
  }

  // ── Layer 2: 2 段階 Gemini ────────────────────────────────────────
  if (candidates.corporate.length === 0 && hasGemini) {
    try {
      const corp = await geminiSuggestCorpUrl(target.name);
      if (corp) candidates.corporate.push(corp);
    } catch { /* ignore */ }
  }
  const firstVerifiedCorp = await firstValidUrl(candidates.corporate);
  if (firstVerifiedCorp && hasGemini) {
    try {
      const body = await fetchPage(firstVerifiedCorp);
      const paths = await geminiExtractPathsFromHomepage(target.name, firstVerifiedCorp, body);
      candidates.recruit.push(...paths.recruit_urls);
      candidates.contact.push(...paths.contact_urls);
      if (paths.email && !contact_email) contact_email = paths.email;
      if (paths.linkedin) candidates.linkedin.push(paths.linkedin);
      notes.push("site-extract");
    } catch (err) { notes.push(`site-extract failed: ${(err as Error).message}`); }
  }

  // ── Layer 3: パターン総当たり ─────────────────────────────────────
  if (firstVerifiedCorp) {
    const root = firstVerifiedCorp.replace(/\/+$/, "");
    const recruitPatterns = ["/recruit/", "/recruit", "/careers/", "/careers", "/career", "/採用情報/", "/採用情報", "/jobs/", "/jobs"];
    const contactPatterns = ["/contact/", "/contact", "/inquiry/", "/inquiry", "/contact-us/", "/contact-us", "/お問い合わせ/", "/お問い合わせ"];
    for (const p of recruitPatterns) candidates.recruit.push(root + p);
    for (const p of contactPatterns) candidates.contact.push(root + p);
  }

  // ── Layer 4: 単発 Gemini フォールバック ───────────────────────────
  if (candidates.recruit.length === 0 && candidates.contact.length === 0 && hasGemini) {
    try {
      const single = await geminiSingleShotAll(target.name);
      if (single.corporate_url)    candidates.corporate.push(single.corporate_url);
      if (single.recruit_page_url) candidates.recruit.push(single.recruit_page_url);
      if (single.contact_form_url) candidates.contact.push(single.contact_form_url);
      if (single.linkedin_url)     candidates.linkedin.push(single.linkedin_url);
      if (single.contact_email && !contact_email) contact_email = single.contact_email;
      notes.push("single-gemini-fallback");
    } catch { /* swallow */ }
  }

  // ── 最終 HEAD 検証 ────────────────────────────────────────────────
  const [corpFinal, recruitFinal, contactFinal, linkedinFinal] = await Promise.all([
    firstValidUrl(dedupe(candidates.corporate)),
    firstValidUrl(dedupe(candidates.recruit)),
    firstValidUrl(dedupe(candidates.contact)),
    firstValidUrl(dedupe(candidates.linkedin)),
  ]);

  const verified: EnrichResult = {
    corporate_url:    corpFinal,
    recruit_page_url: recruitFinal,
    contact_form_url: contactFinal,
    linkedin_url:     linkedinFinal,
    contact_email,
    confidence:
      (corpFinal ? 0.25 : 0) +
      (recruitFinal ? 0.35 : 0) +
      (contactFinal ? 0.25 : 0) +
      (linkedinFinal ? 0.1 : 0) +
      (contact_email ? 0.05 : 0),
    note: notes.join(" | "),
  };

  if (target.id) {
    const { data: cur } = await db.from("ra_companies").select("contact_paths").eq("id", target.id).maybeSingle();
    const existing: Array<{ kind?: string; url?: string }> = Array.isArray(cur?.contact_paths) ? cur!.contact_paths : [];
    const next = [...existing];
    const upsertPath = (kind: string, url: string | null) => {
      if (!url) return;
      if (next.find((p) => p.kind === kind && p.url === url)) return;
      next.push({ kind, url });
    };
    upsertPath("form",     verified.contact_form_url);
    upsertPath("email",    verified.contact_email);
    upsertPath("linkedin", verified.linkedin_url);

    const patch: Record<string, unknown> = { contact_paths: next, updated_at: new Date().toISOString() };
    if (verified.recruit_page_url) patch.recruit_page_url = verified.recruit_page_url;
    if (verified.corporate_url)    patch.corporate_url    = verified.corporate_url;
    await db.from("ra_companies").update(patch).eq("id", target.id);
  }
  return verified;
}

// ---------------------------------------------------------------------------
// enrichOne の補助関数 (Layer 1〜4)
// ---------------------------------------------------------------------------

// 企業名の正規化キー — discover の重複排除に使う
// 「株式会社/(株)/有限会社/(有)」「全角/半角スペース」「・/-/—」を除去して NFKC + 小文字化
function normalizeCompanyName(name: string): string {
  return name
    .normalize("NFKC")
    .replace(/株式会社|有限会社|合同会社|\(株\)|（株）|\(有\)|（有\)|株\.|有\./g, "")
    .replace(/[\s　\-—・]/g, "")
    .toLowerCase();
}

function dedupe(arr: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of arr) {
    if (!x) continue;
    const key = x.replace(/\/+$/, "").toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(x);
  }
  return out;
}

async function firstValidUrl(urls: string[]): Promise<string | null> {
  for (const u of urls.slice(0, 6)) {
    if (await urlExists(u)) return u;
  }
  return null;
}

type GoogleHits = {
  corpHits: import("../_lib/ra-search.js").SearchHit[];
  recHits: import("../_lib/ra-search.js").SearchHit[];
  contactHits: import("../_lib/ra-search.js").SearchHit[];
  linkedinHits: import("../_lib/ra-search.js").SearchHit[];
};

async function pickFromSearchResults(name: string, hits: GoogleHits): Promise<{
  corporate_url: string | null;
  recruit_page_url: string | null;
  contact_form_url: string | null;
  linkedin_url: string | null;
}> {
  if (!hasGemini) {
    return {
      corporate_url:    hits.corpHits[0]?.link ?? null,
      recruit_page_url: hits.recHits[0]?.link ?? null,
      contact_form_url: hits.contactHits[0]?.link ?? null,
      linkedin_url:     hits.linkedinHits[0]?.link ?? null,
    };
  }
  const fmt = (h: import("../_lib/ra-search.js").SearchHit[]) =>
    h.length === 0 ? "(なし)" : h.map((x, i) => `${i + 1}. ${x.link}\n   ${x.title}\n   ${x.snippet}`).join("\n");
  const prompt = `日本企業「${name}」について、Google 検索結果から本物の URL を 1 つずつ選んでください。
転職メディア (Indeed / リクナビ / マイナビ / Wantedly 等) より公式サイトを優先。
確証が無い項目は null。

# 公式サイト 候補
${fmt(hits.corpHits)}

# 採用情報 候補
${fmt(hits.recHits)}

# お問い合わせ 候補
${fmt(hits.contactHits)}

# LinkedIn 候補
${fmt(hits.linkedinHits)}

JSON のみ:
{ "corporate_url": "...|null", "recruit_page_url": "...|null", "contact_form_url": "...|null", "linkedin_url": "...|null" }`;
  return generateJson(prompt, { temperature: 0.1 });
}

async function geminiSuggestCorpUrl(name: string): Promise<string | null> {
  const prompt = `日本企業「${name}」のコーポレートサイト (公式サイト) のトップ URL を 1 つだけ返してください。
**確証が無いなら null**。推測でドメインをでっち上げないこと。

JSON のみ: { "url": "https://...|null" }`;
  const r = await generateJson<{ url: string | null }>(prompt, { temperature: 0.1 });
  return r.url || null;
}

async function geminiExtractPathsFromHomepage(name: string, corpUrl: string, body: string): Promise<{
  recruit_urls: string[]; contact_urls: string[]; email: string | null; linkedin: string | null;
}> {
  const prompt = `「${name}」のコーポレートサイト ${corpUrl} のトップページから、以下のリンク・情報を**実際に本文に存在するもの**だけ抽出してください。推測で URL を作らないこと。

* 採用ページ (recruit / careers / 採用情報 / 採用案内 等のリンク先)
* お問い合わせフォーム (contact / 問い合わせ / inquiry)
* 公開メールアドレス (info@ や recruit@ 等)
* 公式 LinkedIn (linkedin.com/company/...)

複数候補があれば配列で返す。絶対 URL に整形 (相対パスはコーポレート URL に連結)。

JSON のみ:
{ "recruit_urls": ["..."], "contact_urls": ["..."], "email": "...|null", "linkedin": "...|null" }

--- ページ本文 ---
${String(body).slice(0, 15000)}`;
  const r = await generateJson<{
    recruit_urls?: string[]; contact_urls?: string[]; email?: string | null; linkedin?: string | null;
  }>(prompt, { temperature: 0.1 });
  return {
    recruit_urls: Array.isArray(r.recruit_urls) ? r.recruit_urls.filter(Boolean) : [],
    contact_urls: Array.isArray(r.contact_urls) ? r.contact_urls.filter(Boolean) : [],
    email:        r.email || null,
    linkedin:     r.linkedin || null,
  };
}

async function geminiSingleShotAll(name: string): Promise<EnrichResult> {
  const prompt = `日本企業「${name}」について、以下 5 種類の URL / 情報を可能な限り推定。
**確証が無いものは null**。

JSON のみ:
{
  "corporate_url":    "https://...|null",
  "recruit_page_url": "https://...|null",
  "contact_form_url": "https://...|null",
  "contact_email":    "info@...|null",
  "linkedin_url":     "https://www.linkedin.com/company/...|null",
  "confidence": 0-1,
  "note": "..."
}`;
  return generateJson<EnrichResult>(prompt, { temperature: 0.1 });
}

/**
 * Auto-enrich: pick companies that have NO recruit_page_url and NO contact_paths,
 * and let Gemini guess their URLs. This is what makes the pipeline truly hands-free.
 */
async function runEnrich(db: DB, opts: { limit: number }) {
  if (!hasGemini) return { enriched: 0, failed: 0, errors: [] };

  const { data: companies, error } = await db
    .from("ra_companies")
    .select("id,name")
    .is("recruit_page_url", null)
    .order("created_at", { ascending: true })
    .limit(opts.limit);
  if (error) throw new Error(error.message);

  let enriched = 0, failed = 0;
  const errors: string[] = [];

  await mapWithConcurrency(companies ?? [], 1, async (c) => {
    try {
      await enrichOne(db, { id: c.id as string, name: c.name as string });
      enriched += 1;
    } catch (err) {
      failed += 1;
      errors.push(`${c.name}: ${(err as Error).message}`);
    }
  });

  await db.from("ra_crawl_runs").insert({
    kind: "enrich", finished_at: new Date().toISOString(),
    ok: failed === 0, stats: { enriched, failed, model: geminiModel }, error: errors.join(" | ") || null,
  });
  return { ok: true, enriched, failed, errors };
}

/** Manual trigger from the UI / curl. */
async function enrichEndpoint(db: DB, req: VercelRequest, res: VercelResponse) {
  const limit = Number(req.query.limit ?? 20);
  const r = await runEnrich(db, { limit });
  return res.json(r);
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
    .select("id,name,recruit_page_url");
  if (error) return res.status(500).json({ error: error.message });

  // Background: enrich URLs for newly added companies that came in without one.
  // Fire-and-forget so the UI gets a fast response. Up to 20 in parallel(5).
  if (hasGemini && data) {
    const targets = data.filter((d) => !d.recruit_page_url).slice(0, 20);
    void mapWithConcurrency(targets, 1, async (c) => {
      try { await enrichOne(db, { id: c.id as string, name: c.name as string }); } catch { /* swallowed */ }
    });
  }

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
