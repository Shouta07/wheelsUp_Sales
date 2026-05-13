// Mock-mode data source. Used by pages when Supabase is not configured.

import fs from "node:fs";
import path from "node:path";
import { parseCSV, coerce } from "./csv";
import type {
  Candidate,
  Company,
  CompanyOverview,
  DiscoveryItem,
  ReadyRow,
} from "./types";

const DATA_DIR = path.join(process.cwd(), "data");

let _companies: Company[] | null = null;
let _candidates: Candidate[] | null = null;

export function loadMockCompanies(): Company[] {
  if (_companies) return _companies;
  const csv = fs.readFileSync(path.join(DATA_DIR, "companies_seed.csv"), "utf-8");
  const rows = parseCSV(csv).map(coerce);
  const now = new Date().toISOString();
  _companies = rows.map((r, i) => ({
    id: `mock-co-${i + 1}`,
    name: String(r.name ?? ""),
    name_kana: (r.name_kana as string) || null,
    category: (r.category as string) || null,
    priority: typeof r.priority === "number" ? r.priority : 3,
    homepage_url: (r.homepage_url as string) || null,
    recruit_page_url: (r.recruit_page_url as string) || null,
    inquiry_form_url: (r.inquiry_form_url as string) || null,
    phone: (r.phone as string) || null,
    address: (r.address as string) || null,
    employees_range: (r.employees_range as string) || null,
    capital_jpy: typeof r.capital_jpy === "number" ? r.capital_jpy : null,
    established_year: typeof r.established_year === "number" ? r.established_year : null,
    ceo_name: (r.ceo_name as string) || null,
    hr_contact_name: (r.hr_contact_name as string) || null,
    hr_contact_email: (r.hr_contact_email as string) || null,
    hr_contact_phone: (r.hr_contact_phone as string) || null,
    notes: (r.notes as string) || null,
    source: (r.source as string) || "seed",
    status: (r.status as string) || "active",
    created_at: now,
    updated_at: now,
  }));
  return _companies;
}

export function loadMockCandidates(): Candidate[] {
  if (_candidates) return _candidates;
  const raw = fs.readFileSync(path.join(DATA_DIR, "candidates_seed.json"), "utf-8");
  const arr = JSON.parse(raw) as Omit<Candidate, "id">[];
  _candidates = arr.map((c, i) => ({ id: `mock-cand-${i + 1}`, ...c }));
  return _candidates;
}

export function mockCompanyOverviews(): CompanyOverview[] {
  return loadMockCompanies().map((c) => ({
    id: c.id,
    name: c.name,
    category: c.category ?? null,
    priority: c.priority,
    status: c.status,
    recruit_page_url: c.recruit_page_url ?? null,
    hr_contact_email: c.hr_contact_email ?? null,
    open_jobs: 0,
    good_matches: 0,
    last_activity_at: null,
    updated_at: c.updated_at,
  }));
}

export function mockReady(): ReadyRow[] {
  return [];
}

export function mockDiscovery(): DiscoveryItem[] {
  return [];
}
