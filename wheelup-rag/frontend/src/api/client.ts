const BASE = "/api";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "Unknown error");
    throw new Error(`API Error ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

/* ---------- Types ---------- */

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

/* ---------- API functions ---------- */

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
  return request<BriefingResponse>(`/briefing/${dealId}`, {
    method: "POST",
  });
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
