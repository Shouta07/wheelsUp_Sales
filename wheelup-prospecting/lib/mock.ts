// Mock data layer — reads data/companies_seed.csv and data/candidates_seed.json
// from disk so the UI is meaningfully populated even without Supabase configured.

import { readFile } from "node:fs/promises";
import path from "node:path";

import { parseCsv } from "./csv";
import type {
  Candidate,
  CandidateProfile,
  CompanyOverview,
  ContactPath,
  DiscoveryRow,
  Priority,
  ReadyRow,
} from "./types";

const DATA_DIR = path.join(process.cwd(), "data");

let _companies: CompanyOverview[] | null = null;
let _candidates: Candidate[] | null = null;

export async function mockCompanies(): Promise<CompanyOverview[]> {
  if (_companies) return _companies;
  const csv = await readFile(path.join(DATA_DIR, "companies_seed.csv"), "utf8");
  const rows = parseCsv(csv);
  _companies = rows.map((r, i) => ({
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
  return _companies;
}

export async function mockCompanyById(id: string) {
  const list = await mockCompanies();
  const overview = list.find((c) => c.id === id) ?? null;
  if (!overview) return null;
  return {
    overview,
    contact_paths: [] as ContactPath[],
    notes: null as string | null,
    jobs: [] as { id: string; title: string; url: string | null; is_open: boolean; last_seen_at: string }[],
    matches: [] as ReadyRow[],
    activities: [] as { id: string; kind: string; channel: string | null; body: string | null; occurred_at: string }[],
  };
}

export async function mockCandidates(): Promise<Candidate[]> {
  if (_candidates) return _candidates;
  const json = await readFile(path.join(DATA_DIR, "candidates_seed.json"), "utf8");
  const raw = JSON.parse(json) as {
    code: string;
    name: string;
    headline?: string;
    profile: CandidateProfile;
  }[];
  const now = new Date().toISOString();
  _candidates = raw.map((c, i) => ({
    id: `mock-c-${i + 1}`,
    code: c.code,
    name: c.name,
    headline: c.headline ?? null,
    profile: c.profile,
    is_active: true,
    created_at: now,
    updated_at: now,
  }));
  return _candidates;
}

export async function mockReady(): Promise<ReadyRow[]> {
  return [];
}

export async function mockDiscovery(): Promise<DiscoveryRow[]> {
  return [];
}
