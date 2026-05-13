// Read-side queries shared by server components. Each one routes to Supabase
// when live, or to the mock layer otherwise — pages never branch on env.

import { isLive, sb } from "./supabase";
import {
  mockCandidates,
  mockCompanies,
  mockCompanyById,
  mockDiscovery,
  mockReady,
} from "./mock";
import type {
  Activity,
  Candidate,
  Company,
  CompanyOverview,
  DiscoveryRow,
  Job,
  ReadyRow,
} from "./types";

// ---------- Companies ----------

export async function listCompanyOverview(): Promise<CompanyOverview[]> {
  if (!isLive) return mockCompanies();
  return sb.select<CompanyOverview>("company_overview", {
    select: "*",
    order: "priority.asc,name.asc",
    limit: 1000,
  });
}

export async function getCompanyDetail(id: string) {
  if (!isLive) return mockCompanyById(id);

  const [company] = await sb.select<Company>("companies", {
    select: "*",
    id: `eq.${id}`,
    limit: 1,
  });
  if (!company) return null;

  const [overview] = await sb.select<CompanyOverview>("company_overview", {
    select: "*",
    id: `eq.${id}`,
    limit: 1,
  });
  const jobs = await sb.select<Job>("jobs", {
    select: "*",
    company_id: `eq.${id}`,
    order: "is_open.desc,last_seen_at.desc",
    limit: 50,
  });
  const matches = await sb.select<ReadyRow>("ready_to_execute", {
    select: "*",
    company_id: `eq.${id}`,
    limit: 50,
  });
  const activities = await sb.select<Activity>("activities", {
    select: "*",
    company_id: `eq.${id}`,
    order: "occurred_at.desc",
    limit: 50,
  });

  return {
    overview: overview ?? {
      id: company.id,
      name: company.name,
      category: company.category,
      priority: company.priority,
      recruit_page_url: company.recruit_page_url,
      corporate_url: company.corporate_url,
      last_crawled_at: company.last_crawled_at,
      open_jobs: jobs.filter((j) => j.is_open).length,
      strong_matches: matches.length,
      last_activity_at: activities[0]?.occurred_at ?? null,
    },
    contact_paths: company.contact_paths ?? [],
    notes: company.notes,
    jobs: jobs.map((j) => ({
      id: j.id,
      title: j.title,
      url: j.url,
      is_open: j.is_open,
      last_seen_at: j.last_seen_at,
    })),
    matches,
    activities: activities.map((a) => ({
      id: a.id,
      kind: a.kind,
      channel: a.channel,
      body: a.body,
      occurred_at: a.occurred_at,
    })),
  };
}

// ---------- Ready / Discovery / Candidates ----------

export async function listReady(limit = 200): Promise<ReadyRow[]> {
  if (!isLive) return mockReady();
  return sb.select<ReadyRow>("ready_to_execute", {
    select: "*",
    limit,
  });
}

export async function listDiscovery(): Promise<DiscoveryRow[]> {
  if (!isLive) return mockDiscovery();
  return sb.select<DiscoveryRow>("discovery_queue", {
    select: "*",
    status: "eq.pending",
    order: "created_at.desc",
    limit: 200,
  });
}

export async function listCandidates(): Promise<Candidate[]> {
  if (!isLive) return mockCandidates();
  return sb.select<Candidate>("candidates", {
    select: "*",
    is_active: "eq.true",
    order: "code.asc",
  });
}
