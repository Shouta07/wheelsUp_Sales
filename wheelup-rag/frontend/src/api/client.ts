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
