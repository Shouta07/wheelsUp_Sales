/**
 * Browser-side data layer for the RA prospecting screens.
 * Routes to Supabase (anon key) when configured, otherwise to mock data fetched
 * from /ra/*. Both modes return the same shapes.
 *
 * NOTE: this uses the existing wheelup-vercel Supabase project. We rely on RLS
 * being permissive for the ra_* tables OR on a separate signed-in user. For
 * the first cut we read with anon key — if your RLS blocks reads, write a
 * `read for all` policy on the ra_* tables.
 */
import { supabase, isSupabaseConfigured } from "../supabase";
import { parseCsv } from "./csv";
import type {
  Activity, Candidate, Company, CompanyOverview, ContactPath,
  DiscoveryRow, Grade, Job, JobWithCompany, Priority, ReadyRow,
} from "./types";

export const isLive = isSupabaseConfigured;

// ---------- Mock cache ----------
let _mockCompanies: CompanyOverview[] | null = null;
let _mockCandidates: Candidate[] | null = null;

async function fetchMockCompanies(): Promise<CompanyOverview[]> {
  if (_mockCompanies) return _mockCompanies;
  const res = await fetch("/ra/companies_seed.csv");
  const csv = await res.text();
  const rows = parseCsv(csv);
  _mockCompanies = rows.map((r, i) => ({
    id: `mock-co-${i + 1}`,
    name: r.name,
    category: r.category || null,
    priority: ((r.priority || "B").toUpperCase() as Priority),
    recruit_page_url: r.recruit_page_url || null,
    corporate_url: r.corporate_url || null,
    last_crawled_at: null,
    open_jobs: 0,
    strong_matches: 0,
    last_activity_at: null,
  }));
  return _mockCompanies;
}

async function fetchMockCandidates(): Promise<Candidate[]> {
  if (_mockCandidates) return _mockCandidates;
  const res = await fetch("/ra/candidates_seed.json");
  const raw = (await res.json()) as Array<{
    code: string; name: string; headline?: string; profile: Candidate["profile"];
  }>;
  _mockCandidates = raw.map((c, i) => ({
    id: `mock-c-${i + 1}`, code: c.code, name: c.name,
    headline: c.headline ?? null, profile: c.profile, is_active: true,
  }));
  return _mockCandidates;
}

// ---------- Public API ----------

export async function listCompanyOverview(): Promise<CompanyOverview[]> {
  if (!isLive) return fetchMockCompanies();
  const { data, error } = await supabase
    .from("ra_company_overview")
    .select("*")
    .order("priority", { ascending: true })
    .order("name", { ascending: true })
    .limit(1000);
  if (error) throw error;
  return (data ?? []) as CompanyOverview[];
}

export async function getCompanyDetail(id: string) {
  if (!isLive) {
    const overview = (await fetchMockCompanies()).find((c) => c.id === id);
    if (!overview) return null;
    return {
      overview,
      contact_paths: [] as Company["contact_paths"],
      notes: null as string | null,
      jobs: [] as Job[],
      matches: [] as ReadyRow[],
      activities: [] as Activity[],
    };
  }

  const [{ data: company }, { data: overview }, { data: jobs }, { data: matches }, { data: activities }] = await Promise.all([
    supabase.from("ra_companies").select("*").eq("id", id).maybeSingle(),
    supabase.from("ra_company_overview").select("*").eq("id", id).maybeSingle(),
    supabase.from("ra_jobs").select("*").eq("company_id", id).order("is_open", { ascending: false }).order("last_seen_at", { ascending: false }).limit(50),
    supabase.from("ra_ready_to_execute").select("*").eq("company_id", id).limit(50),
    supabase.from("ra_activities").select("*").eq("company_id", id).order("occurred_at", { ascending: false }).limit(50),
  ]);
  if (!company) return null;
  return {
    overview: (overview as CompanyOverview) ?? null,
    contact_paths: (company.contact_paths ?? []) as Company["contact_paths"],
    notes: (company.notes ?? null) as string | null,
    jobs: (jobs ?? []) as Job[],
    matches: (matches ?? []) as ReadyRow[],
    activities: (activities ?? []) as Activity[],
  };
}

export async function listReady(limit = 200): Promise<ReadyRow[]> {
  if (!isLive) return [];
  const { data, error } = await supabase.from("ra_ready_to_execute").select("*").limit(limit);
  if (error) throw error;
  return (data ?? []) as ReadyRow[];
}

export async function listDiscovery(): Promise<DiscoveryRow[]> {
  if (!isLive) return [];
  const { data, error } = await supabase
    .from("ra_discovery_queue").select("*")
    .eq("status", "pending").order("created_at", { ascending: false }).limit(200);
  if (error) throw error;
  return (data ?? []) as DiscoveryRow[];
}

/**
 * 月次 KPI — 「月 5 件の打ち合わせ設定」目標 (2026/5/14 ミーティング) に直結する数値。
 *   sent     : 今月の送信件数 (kind='sent')
 *   meeting  : 今月の打ち合わせ確定 (kind='meeting')
 *   closed   : 今月の成約 (kind='closed')
 *   meeting_rate: meeting / sent
 *   double_circle_hit_rate: 「◎判定 → meeting/closed まで進んだ割合」
 */
export type MonthlyKPI = {
  sent: number;
  meeting: number;
  closed: number;
  meeting_rate: number | null;
  double_circle_total: number;
  double_circle_hit: number;
  double_circle_hit_rate: number | null;
};

export async function getMonthlyKPI(): Promise<MonthlyKPI> {
  if (!isLive) {
    return { sent: 0, meeting: 0, closed: 0, meeting_rate: null,
             double_circle_total: 0, double_circle_hit: 0, double_circle_hit_rate: null };
  }
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  // Activities since the 1st of this month.
  const { data: acts } = await supabase
    .from("ra_activities")
    .select("kind,job_id,candidate_id")
    .gte("occurred_at", monthStart)
    .limit(5000);
  const list = acts ?? [];

  const sent    = list.filter((a) => a.kind === "sent").length;
  const meeting = list.filter((a) => a.kind === "meeting").length;
  const closed  = list.filter((a) => a.kind === "closed").length;

  // ◎の的中率 — 今月作られた ◎ matches のうち、後で meeting/closed が起きた割合。
  // (job_id, candidate_id) ペアで突合する。
  const { data: dblCircles } = await supabase
    .from("ra_matches")
    .select("job_id,candidate_id")
    .eq("grade", "◎")
    .gte("created_at", monthStart)
    .limit(5000);
  const dblList = dblCircles ?? [];

  const hitKeys = new Set(
    list
      .filter((a) => a.kind === "meeting" || a.kind === "closed")
      .map((a) => `${a.job_id ?? ""}|${a.candidate_id ?? ""}`),
  );
  const hit = dblList.filter((m) => hitKeys.has(`${m.job_id}|${m.candidate_id}`)).length;

  return {
    sent, meeting, closed,
    meeting_rate: sent > 0 ? meeting / sent : null,
    double_circle_total: dblList.length,
    double_circle_hit: hit,
    double_circle_hit_rate: dblList.length > 0 ? hit / dblList.length : null,
  };
}

// =============================================================================
// PROGRESS / ACTIVITY PANELS
// 「自分が押したボタンの結果」と「DBが今どうなってるか」を見せるための簡易クエリ群。
// =============================================================================

export type ProgressCounts = {
  companies: number;
  with_url: number;
  crawled: number;
  open_jobs: number;
  matches_total: number;
  strong_matches: number;     // ◎○
  ready: number;              // ◎○ かつ未送信
  sent_this_month: number;
};

export async function getProgressCounts(): Promise<ProgressCounts> {
  if (!isLive) {
    return {
      companies: 0, with_url: 0, crawled: 0, open_jobs: 0,
      matches_total: 0, strong_matches: 0, ready: 0, sent_this_month: 0,
    };
  }
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
  const [c1, c2, c3, c4, c5, c6, c7, c8] = await Promise.all([
    supabase.from("ra_companies").select("id", { count: "exact", head: true }),
    supabase.from("ra_companies").select("id", { count: "exact", head: true }).not("recruit_page_url", "is", null),
    supabase.from("ra_companies").select("id", { count: "exact", head: true }).not("last_crawled_at", "is", null),
    supabase.from("ra_jobs").select("id", { count: "exact", head: true }).eq("is_open", true),
    supabase.from("ra_matches").select("id", { count: "exact", head: true }),
    supabase.from("ra_matches").select("id", { count: "exact", head: true }).in("grade", ["◎", "○"]),
    supabase.from("ra_ready_to_execute").select("match_id", { count: "exact", head: true }),
    supabase.from("ra_activities").select("id", { count: "exact", head: true }).eq("kind", "sent").gte("occurred_at", monthStart),
  ]);
  return {
    companies:        c1.count ?? 0,
    with_url:         c2.count ?? 0,
    crawled:          c3.count ?? 0,
    open_jobs:        c4.count ?? 0,
    matches_total:    c5.count ?? 0,
    strong_matches:   c6.count ?? 0,
    ready:            c7.count ?? 0,
    sent_this_month:  c8.count ?? 0,
  };
}

export type CrawlRunRow = {
  id: string;
  kind: string;
  started_at: string | null;
  finished_at: string | null;
  ok: boolean | null;
  stats: Record<string, unknown> | null;
  error: string | null;
};

export async function listRecentRuns(limit = 5): Promise<CrawlRunRow[]> {
  if (!isLive) return [];
  const { data } = await supabase
    .from("ra_crawl_runs")
    .select("id,kind,started_at,finished_at,ok,stats,error")
    .order("finished_at", { ascending: false, nullsFirst: false })
    .limit(limit);
  return (data ?? []) as CrawlRunRow[];
}

export async function listCandidates(includeInactive = true): Promise<Candidate[]> {
  if (!isLive) return fetchMockCandidates();
  let q = supabase.from("ra_candidates").select("*").order("is_active", { ascending: false }).order("code", { ascending: true });
  if (!includeInactive) q = q.eq("is_active", true);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as Candidate[];
}

// Companies enriched with contact_paths (separate fetch, merged in memory).
export async function listCompaniesEnriched(): Promise<Array<CompanyOverview & { contact_paths: ContactPath[] }>> {
  const ovs = await listCompanyOverview();
  if (!isLive) return ovs.map((o) => ({ ...o, contact_paths: [] }));
  const { data } = await supabase.from("ra_companies").select("id,contact_paths").limit(2000);
  const byId = new Map<string, ContactPath[]>();
  for (const r of (data ?? []) as Array<{ id: string; contact_paths: ContactPath[] }>) {
    byId.set(r.id, Array.isArray(r.contact_paths) ? r.contact_paths : []);
  }
  return ovs.map((o) => ({ ...o, contact_paths: byId.get(o.id) ?? [] }));
}

// Open jobs × company × best-match-candidate, flattened. Powers the "募集ポジション一覧".
export async function listOpenJobsWithContact(): Promise<JobWithCompany[]> {
  if (!isLive) return [];

  const [{ data: jobs, error: e1 }, { data: companies, error: e2 }, { data: matches, error: e3 }] = await Promise.all([
    supabase.from("ra_jobs").select("*").eq("is_open", true).order("last_seen_at", { ascending: false }).limit(2000),
    supabase.from("ra_companies").select("id,name,priority,category,recruit_page_url,contact_paths").limit(2000),
    supabase.from("ra_ready_to_execute").select("job_id,grade,score,candidate_name").limit(5000),
  ]);
  if (e1) throw e1; if (e2) throw e2; if (e3) throw e3;

  const compById = new Map<string, { name: string; priority: Priority; category: string | null; recruit_page_url: string | null; contact_paths: ContactPath[] }>();
  for (const c of (companies ?? []) as Array<{ id: string; name: string; priority: Priority; category: string | null; recruit_page_url: string | null; contact_paths: ContactPath[] }>) {
    compById.set(c.id, {
      name: c.name, priority: c.priority, category: c.category,
      recruit_page_url: c.recruit_page_url,
      contact_paths: Array.isArray(c.contact_paths) ? c.contact_paths : [],
    });
  }
  const bestByJob = new Map<string, { grade: Grade; score: number; candidate_name: string }>();
  for (const m of (matches ?? []) as Array<{ job_id: string; grade: Grade; score: number; candidate_name: string }>) {
    const cur = bestByJob.get(m.job_id);
    if (!cur || m.score > cur.score) bestByJob.set(m.job_id, { grade: m.grade, score: m.score, candidate_name: m.candidate_name });
  }
  return ((jobs ?? []) as Job[]).map((j) => {
    const c = compById.get(j.company_id);
    const formPath = c?.contact_paths.find((p) => p.kind === "form");
    const emailPath = c?.contact_paths.find((p) => p.kind === "email");
    const best = bestByJob.get(j.id);
    return {
      job_id: j.id, job_title: j.title, job_url: j.url,
      description: j.description, requirements: j.requirements,
      employment_type: j.employment_type, location: j.location, salary_range: j.salary_range,
      last_seen_at: j.last_seen_at, is_open: j.is_open,
      company_id: j.company_id, company_name: c?.name ?? "(unknown)",
      company_priority: c?.priority ?? "C", company_category: c?.category ?? null,
      recruit_page_url: c?.recruit_page_url ?? null,
      contact_form_url: formPath?.url ?? null,
      contact_email: emailPath?.url ?? emailPath?.value ?? null,
      best_grade: best?.grade ?? null,
      best_score: best?.score ?? null,
      best_candidate_name: best?.candidate_name ?? null,
    };
  });
}

// ---------- Mutation ----------
//
// 認証方針 (内部ツール用簡易方式):
// 1) Supabase ログイン中なら session JWT を Bearer 送信
// 2) 未ログインなら VITE_CRON_SECRET (Vercel 環境変数) を ?secret= 送信
//    → 5人チームの社内ツール想定。シークレットは JS バンドルに混入するが、
//      URL を知ってる人しかアクセスしないので運用上は許容範囲。
//      公開する時は Supabase Auth ベースに切り替える。

// trim() で前後のホワイトスペース (タブ/改行/空白) を除去。
// Vercel env への貼り付け時にタブ等が紛れ込むケースが多々あるための防御。
const CLIENT_SECRET = ((import.meta.env.VITE_CRON_SECRET as string | undefined) ?? "").trim();

async function authParts(): Promise<{ headers: Record<string, string>; querySuffix: string }> {
  // Supabase ログイン優先
  if (isLive) {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (token) return { headers: { Authorization: `Bearer ${token}` }, querySuffix: "" };
  }
  // フォールバック: client-side secret
  if (CLIENT_SECRET) {
    return { headers: {}, querySuffix: `secret=${encodeURIComponent(CLIENT_SECRET)}` };
  }
  return { headers: {}, querySuffix: "" };
}

async function call<T>(path: string, init: { method?: "GET" | "POST"; body?: unknown } = {}): Promise<T> {
  const { headers: authHeaders, querySuffix } = await authParts();

  // path に既に query が含まれる場合は & で繋ぐ
  let url = `/api/ra/${path}`;
  if (querySuffix) {
    url += (path.includes("?") ? "&" : "?") + querySuffix;
  }

  const res = await fetch(url, {
    method: init.method ?? "POST",
    headers: { "Content-Type": "application/json", ...authHeaders },
    body: init.body == null ? undefined : JSON.stringify(init.body),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string; reason?: string } & T;
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}${json.reason ? ` (${json.reason})` : ""}`);
  return json;
}

export const api = {
  // Mutations
  activity: (payload: {
    company_id?: string | null; job_id?: string | null; candidate_id?: string | null;
    kind: string; channel?: string; body?: string;
  }) => call<{ ok: true }>("activity", { body: payload }),

  addCompanies: (rows: Array<Record<string, unknown>>) =>
    call<{ ok: true; added: number; names: string[] }>("add-companies", { body: { rows } }),

  findContactInfo: (input: { company_id?: string; name?: string }) =>
    call<{
      ok: true;
      corporate_url: string | null;
      recruit_page_url: string | null;
      contact_form_url: string | null;
      contact_email: string | null;
      linkedin_url: string | null;
      confidence: number;
      note?: string;
    }>("find-contact-info", { body: input }),

  approveDiscovery: (id: string, opts: { reject?: boolean; priority?: string } = {}) =>
    call<{ ok: true; status: string; company_id?: string }>("approve-discovery", { body: { id, ...opts } }),

  updateCompany: (patch: { id: string } & Record<string, unknown>) =>
    call<{ ok: true; company: Company }>("update-company", { body: patch }),

  updateCandidate: (patch: { id: string } & Record<string, unknown>) =>
    call<{ ok: true; candidate: Candidate }>("update-candidate", { body: patch }),

  addCandidate: (input: { code: string; name: string; headline?: string; profile?: Record<string, unknown>; is_active?: boolean }) =>
    call<{ ok: true; candidate: Candidate }>("add-candidate", { body: input }),

  // Triggers
  run: (kind: "crawl" | "match" | "discover" | "import" | "enrich", params: Record<string, string | number> = {}) => {
    const qs = new URLSearchParams(params as Record<string, string>).toString();
    return call<Record<string, unknown>>(`${kind}${qs ? `?${qs}` : ""}`);
  },
};

// Backwards-compat for existing call sites (ProspectingReady etc.).
export async function postActivity(_secret: string, payload: Parameters<typeof api.activity>[0]) {
  return api.activity(payload);
}
