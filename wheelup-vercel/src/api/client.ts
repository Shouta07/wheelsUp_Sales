import { supabase } from "../lib/supabase";

const BASE = "/api";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  // Supabase セッションのトークンを自動付与
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (session?.access_token) {
    headers["Authorization"] = `Bearer ${session.access_token}`;
  }

  const res = await fetch(`${BASE}${path}`, {
    headers,
    ...init,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "Unknown error");
    throw new Error(`API Error ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

/* ---------- Legacy Deal Types (Dashboard/Briefing/Summary) ---------- */

export interface Deal {
  id: number;
  title: string;
  value: number;
  currency: string;
  stage_id: number;
  person_name: string;
  org_name: string;
  status: string;
  expected_close_date: string;
  next_activity_date: string;
  next_activity_subject: string;
}

export interface SearchResult {
  text: string;
  score: number;
  source: {
    chat_type: string;
    sender_name: string;
    created_at: string;
    chat_name: string;
  };
  entities: Record<string, string[]>;
  pipedrive_deal_id: number | null;
}

export interface SearchResponse {
  results: SearchResult[];
  total: number;
  query_time_ms: number;
}

export interface SearchParams {
  query: string;
  top_k?: number;
  chat_type?: string;
  date_range?: string;
  pipedrive_deal_id?: number;
  sender_name?: string;
}

export interface BriefingResponse {
  deal_id: number;
  briefing: string;
}

export interface SummaryRequest {
  meeting_notes: string;
  duration_minutes?: number;
  attendees?: string[];
}

export interface SummaryResponse {
  deal_id: number;
  summary: string;
  pipedrive_note_id?: number;
}

/* ---------- Legacy API functions ---------- */

export async function searchKnowledge(
  params: SearchParams,
): Promise<SearchResponse> {
  return request<SearchResponse>("/search", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export async function generateBriefing(
  dealId: number,
): Promise<BriefingResponse> {
  return request<BriefingResponse>(`/briefing/${dealId}`, { method: "POST" });
}

export async function generateSummary(
  dealId: number,
  data: SummaryRequest,
): Promise<SummaryResponse> {
  return request<SummaryResponse>(`/summary/${dealId}`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function saveSummaryToPipedrive(
  dealId: number,
  data: SummaryRequest,
): Promise<SummaryResponse> {
  return request<SummaryResponse>(`/summary/${dealId}/save`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

/* ---------- Company Types ---------- */

export interface CompanyItem {
  id: string;
  pipedrive_org_id: number | null;
  name: string;
  industry: string | null;
  address: string | null;
  description: string | null;
  keywords: string[];
  pitch_points: Record<string, string>;
  people_count: number;
  open_deals_count: number;
  won_deals_count: number;
}

export interface CompanyListResponse {
  companies: CompanyItem[];
  total: number;
}

export interface MatchedCompany {
  company: CompanyItem;
  matched_keywords: string[];
  match_score: number;
  pitch_summary: string[];
}

export interface KeywordMatchResponse {
  results: MatchedCompany[];
  total: number;
  query_keywords: string[];
}

export interface SyncResult {
  synced: number;
  message: string;
}

/* ---------- Company API ---------- */

export async function fetchCompanies(
  q?: string,
  keyword?: string,
): Promise<CompanyListResponse> {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (keyword) params.set("keyword", keyword);
  const qs = params.toString();
  return request<CompanyListResponse>(`/companies${qs ? `?${qs}` : ""}`);
}

export async function matchCompanies(
  keywords: string[],
): Promise<KeywordMatchResponse> {
  return request<KeywordMatchResponse>("/companies/match", {
    method: "POST",
    body: JSON.stringify({ keywords }),
  });
}

export async function updateCompanyKeywords(
  companyId: string,
  keywords: string[],
  pitchPoints: Record<string, string> = {},
): Promise<CompanyItem> {
  return request<CompanyItem>(`/companies/${companyId}/keywords`, {
    method: "PUT",
    body: JSON.stringify({ keywords, pitch_points: pitchPoints }),
  });
}

export async function syncCompaniesFromPipedrive(): Promise<SyncResult> {
  return request<SyncResult>("/companies/sync", { method: "POST" });
}

/* ---------- Candidate Types ---------- */

export interface CandidateItem {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  age: number | null;
  current_company: string | null;
  current_position: string | null;
  current_industry: string | null;
  years_of_experience: number | null;
  current_salary: number | null;
  qualifications: string[];
  desired_keywords: string[];
  desired_salary: number | null;
  desired_location: string | null;
  desired_position: string | null;
  inferred_needs: Record<string, unknown>;
  matched_companies: Array<Record<string, unknown>>;
  meeting_notes: string | null;
  status: string;
  follow_up_date: string | null;
  follow_up_priority: string;
  follow_up_notes: string | null;
  last_contact_date: string | null;
  days_since_contact: number;
  action_history: Array<{ date: string; action: string; result: string }>;
  pipedrive_person_id: number | null;
  pipedrive_deal_id: number | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface CandidateListResponse {
  candidates: CandidateItem[];
  total: number;
}

export interface CandidateBriefingResponse {
  candidate_id: string;
  briefing: string;
  matched_companies: Array<Record<string, unknown>>;
  inferred_needs: Record<string, unknown>;
}

export interface CandidateCreateData {
  name: string;
  email?: string;
  phone?: string;
  age?: number;
  current_company?: string;
  current_position?: string;
  current_industry?: string;
  years_of_experience?: number;
  current_salary?: number;
  qualifications?: string[];
  desired_keywords?: string[];
  desired_salary?: number;
  desired_location?: string;
  desired_position?: string;
}

/* ---------- Candidate API ---------- */

export async function fetchCandidates(
  status?: string,
  q?: string,
  followUpDue?: boolean,
): Promise<CandidateListResponse> {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (q) params.set("q", q);
  if (followUpDue) params.set("follow_up_due", "true");
  const qs = params.toString();
  return request<CandidateListResponse>(`/candidates${qs ? `?${qs}` : ""}`);
}

export async function createCandidate(
  data: CandidateCreateData,
): Promise<CandidateItem> {
  return request<CandidateItem>("/candidates", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function getCandidate(id: string): Promise<CandidateItem> {
  return request<CandidateItem>(`/candidates/${id}`);
}

export async function updateCandidate(
  id: string,
  data: Partial<CandidateCreateData> & { status?: string; meeting_notes?: string },
): Promise<CandidateItem> {
  return request<CandidateItem>(`/candidates/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function generateCandidateBriefing(
  id: string,
): Promise<CandidateBriefingResponse> {
  return request<CandidateBriefingResponse>(`/candidates/${id}/briefing`, {
    method: "POST",
  });
}

export async function saveMeetingNotes(
  id: string,
  notes: string,
  keywordsDiscovered: string[] = [],
): Promise<CandidateItem> {
  return request<CandidateItem>(`/candidates/${id}/meeting-notes`, {
    method: "POST",
    body: JSON.stringify({ notes, keywords_discovered: keywordsDiscovered }),
  });
}

export async function addCandidateAction(
  id: string,
  action: string,
  result?: string,
): Promise<CandidateItem> {
  return request<CandidateItem>(`/candidates/${id}/action`, {
    method: "POST",
    body: JSON.stringify({ action, result }),
  });
}

export async function updateFollowUp(
  id: string,
  data: {
    status?: string;
    follow_up_date?: string;
    follow_up_priority?: string;
    follow_up_notes?: string;
  },
): Promise<CandidateItem> {
  return request<CandidateItem>(`/candidates/${id}/follow-up`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

/* ---------- Knowledge Types ---------- */

export interface KnowledgeCategory {
  id: string;
  parent_id: string | null;
  name: string;
  slug: string;
  level: number;
  description: string | null;
  market_overview: string | null;
  key_players: string[];
  typical_roles: string[];
  required_qualifications: string[];
  salary_range: string | null;
  growth_trend: string | null;
  selling_points: string[];
  pain_points: string[];
  talking_tips: string | null;
  sort_order: number;
}

export interface QualificationItem {
  id: string;
  name: string;
  category: string | null;
  field: string | null;
  difficulty: string | null;
  description: string | null;
  market_value: string | null;
  salary_impact: string | null;
  related_roles: string[];
  exam_info: string | null;
  tips_for_consultant: string | null;
}

/* ---------- Knowledge API ---------- */

export async function fetchTaxonomy(
  parentSlug?: string,
): Promise<{ categories: KnowledgeCategory[]; total: number }> {
  const qs = parentSlug ? `?parent_slug=${parentSlug}` : "";
  return request(`/knowledge/taxonomy${qs}`);
}

export async function fetchCategory(
  slug: string,
): Promise<KnowledgeCategory> {
  return request(`/knowledge/taxonomy/${slug}`);
}

export async function fetchQualifications(
  field?: string,
): Promise<{ qualifications: QualificationItem[]; total: number }> {
  const qs = field ? `?field=${field}` : "";
  return request(`/knowledge/qualifications${qs}`);
}

export async function seedKnowledgeData(): Promise<{
  categories: number;
  qualifications: number;
  status: string;
}> {
  // データは seed.sql で投入済み。確認用に件数を返す
  const cats = await fetchTaxonomy();
  const quals = await fetchQualifications();
  return {
    categories: cats.total,
    qualifications: quals.total,
    status: cats.total > 0 ? "skipped" : "empty",
  };
}

export async function recordProgress(data: {
  user_name: string;
  category_id?: string;
  qualification_id?: string;
  completed?: boolean;
  quiz_score?: number;
}): Promise<unknown> {
  return request("/knowledge/progress", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function fetchProgress(
  userName: string,
): Promise<{
  user_name: string;
  total_studied: number;
  completed: number;
  entries: Array<Record<string, unknown>>;
}> {
  return request(`/knowledge/progress/${userName}`);
}
