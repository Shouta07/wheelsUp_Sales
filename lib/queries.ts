// Read-side helpers used by server components. Auto-switch between Supabase and mock.

import { sbSelect, supabaseConfigured } from "./supabase";
import { assertUuid, pgEq } from "./pg";
import {
  loadMockCandidates,
  loadMockCompanies,
  mockCompanyOverviews,
  mockDiscovery,
  mockReady,
} from "./mock";
import type {
  Activity,
  Candidate,
  Company,
  CompanyOverview,
  DiscoveryItem,
  Job,
  Match,
  ReadyRow,
} from "./types";

export const isMock = !supabaseConfigured;

export async function getCompanyOverviews(): Promise<CompanyOverview[]> {
  if (isMock) return mockCompanyOverviews();
  return sbSelect<CompanyOverview>(
    "company_overview",
    "select=*&order=priority.desc,name.asc"
  );
}

export async function getCompanies(): Promise<Company[]> {
  if (isMock) return loadMockCompanies();
  return sbSelect<Company>("companies", "select=*&order=priority.desc,name.asc");
}

export async function getCompany(id: string): Promise<Company | null> {
  if (isMock) {
    return loadMockCompanies().find((c) => c.id === id) ?? null;
  }
  assertUuid(id, "company_id");
  const rows = await sbSelect<Company>("companies", `select=*&${pgEq("id", id)}&limit=1`);
  return rows[0] ?? null;
}

export async function getJobsForCompany(companyId: string): Promise<Job[]> {
  if (isMock) return [];
  assertUuid(companyId, "company_id");
  return sbSelect<Job>(
    "jobs",
    `select=*&${pgEq("company_id", companyId)}&order=is_open.desc,last_seen_at.desc`
  );
}

export async function getMatchesForCompany(companyId: string): Promise<
  (Match & { job_title?: string; candidate_name?: string })[]
> {
  if (isMock) return [];
  assertUuid(companyId, "company_id");
  return sbSelect(
    "matches",
    `select=*,jobs!inner(title,company_id),candidates(name,code)&${pgEq("jobs.company_id", companyId)}&order=score.desc`
  ) as Promise<(Match & { job_title?: string; candidate_name?: string })[]>;
}

export async function getActivitiesForCompany(companyId: string): Promise<Activity[]> {
  if (isMock) return [];
  assertUuid(companyId, "company_id");
  return sbSelect<Activity>(
    "activities",
    `select=*&${pgEq("company_id", companyId)}&order=occurred_at.desc&limit=50`
  );
}

export async function getCandidates(): Promise<Candidate[]> {
  if (isMock) return loadMockCandidates();
  return sbSelect<Candidate>("candidates", "select=*&is_active=eq.true");
}

export async function getReady(limit = 200): Promise<ReadyRow[]> {
  if (isMock) return mockReady();
  const n = Math.max(1, Math.min(500, Math.floor(Number(limit) || 200)));
  return sbSelect<ReadyRow>("ready_to_execute", `select=*&limit=${n}`);
}

export async function getDiscovery(): Promise<DiscoveryItem[]> {
  if (isMock) return mockDiscovery();
  return sbSelect<DiscoveryItem>(
    "discovery_queue",
    "select=*&order=created_at.desc&limit=200"
  );
}

export async function getRecentActivities(limit = 20): Promise<Activity[]> {
  if (isMock) return [];
  const n = Math.max(1, Math.min(200, Math.floor(Number(limit) || 20)));
  return sbSelect<Activity>(
    "activities",
    `select=*&order=occurred_at.desc&limit=${n}`
  );
}
