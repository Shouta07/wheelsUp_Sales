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
  Activity, Candidate, Company, CompanyOverview, DiscoveryRow,
  Job, Priority, ReadyRow,
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

export async function listCandidates(): Promise<Candidate[]> {
  if (!isLive) return fetchMockCandidates();
  const { data, error } = await supabase
    .from("ra_candidates").select("*").eq("is_active", true).order("code", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Candidate[];
}

// ---------- Mutation ----------
//
// Every browser → /api/ra/* call attaches the Supabase session JWT in the
// Authorization header. The server-side handler accepts EITHER that JWT OR
// `?secret=$CRON_SECRET` (for cron / curl), so secrets stay on the server.

async function authHeader(): Promise<Record<string, string>> {
  if (!isLive) return {};
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function call<T>(path: string, init: { method?: "GET" | "POST"; body?: unknown } = {}): Promise<T> {
  const headers = { "Content-Type": "application/json", ...(await authHeader()) };
  const res = await fetch(`/api/ra/${path}`, {
    method: init.method ?? "POST",
    headers,
    body: init.body == null ? undefined : JSON.stringify(init.body),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string } & T;
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
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

  draftEmail: (match_id: string) =>
    call<{ ok: true; subject: string; body: string }>("draft", { body: { match_id } }),

  updateCompany: (patch: { id: string } & Record<string, unknown>) =>
    call<{ ok: true; company: Company }>("update-company", { body: patch }),

  updateCandidate: (patch: { id: string } & Record<string, unknown>) =>
    call<{ ok: true; candidate: Candidate }>("update-candidate", { body: patch }),

  pipedriveMatch: (company_id: string) =>
    call<{
      ok: true; ra_name: string;
      matches: Array<{ id: string; name: string; pipedrive_org_id?: number; won_deals_count?: number; open_deals_count?: number; people_count?: number }>;
    }>(`pipedrive-match?company_id=${encodeURIComponent(company_id)}`, { method: "GET" }),

  // Triggers
  run: (kind: "crawl" | "match" | "discover" | "import", params: Record<string, string | number> = {}) => {
    const qs = new URLSearchParams(params as Record<string, string>).toString();
    return call<Record<string, unknown>>(`${kind}${qs ? `?${qs}` : ""}`);
  },
};

// Backwards-compat for existing call sites (ProspectingReady etc.).
export async function postActivity(_secret: string, payload: Parameters<typeof api.activity>[0]) {
  return api.activity(payload);
}
