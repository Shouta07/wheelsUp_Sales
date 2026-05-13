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

export async function postActivity(secret: string, payload: {
  company_id?: string | null; job_id?: string | null; candidate_id?: string | null;
  kind: string; channel?: string; body?: string;
}) {
  const res = await fetch(`/api/ra/activity?secret=${encodeURIComponent(secret)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json;
}
