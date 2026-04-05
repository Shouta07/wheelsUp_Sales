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

/* ---------- Phase Progress ---------- */

export interface PhaseProgress {
  id: string;
  entity_type: "candidate" | "company";
  entity_id: string;
  phase: number;
  checked_items: string[];
  notes: string | null;
  updated_at: string;
}

export async function fetchPhaseProgress(
  entityType: "candidate" | "company",
  entityId: string,
  phase?: number,
): Promise<{ progress: PhaseProgress[] }> {
  const params = new URLSearchParams({ entity_type: entityType, entity_id: entityId });
  if (phase) params.set("phase", String(phase));
  return request(`/candidates/phase-progress?${params}`);
}

export async function savePhaseProgress(
  entityType: "candidate" | "company",
  entityId: string,
  phase: number,
  checkedItems: string[],
  notes?: string,
): Promise<PhaseProgress> {
  return request("/candidates/phase-progress", {
    method: "PUT",
    body: JSON.stringify({ entity_type: entityType, entity_id: entityId, phase, checked_items: checkedItems, notes }),
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

/* ---------- Job Posting Types ---------- */

export interface JobPosting {
  id: string;
  company_id: string | null;
  title: string;
  position_type: string | null;
  industry_category_slug: string | null;
  employment_type: string;
  salary_min: number | null;
  salary_max: number | null;
  location: string | null;
  description: string | null;
  requirements: string[];
  preferred: string[];
  required_qualifications: string[];
  benefits: string | null;
  keywords: string[];
  status: string;
  source: string;
  external_id: string | null;
  notes: string | null;
  published_at: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
  companies: { id: string; name: string } | null;
}

export interface JobListResponse {
  jobs: JobPosting[];
  total: number;
}

export interface JobCreateData {
  title: string;
  company_id?: string;
  position_type?: string;
  industry_category_slug?: string;
  employment_type?: string;
  salary_min?: number;
  salary_max?: number;
  location?: string;
  description?: string;
  requirements?: string[];
  preferred?: string[];
  required_qualifications?: string[];
  benefits?: string;
  keywords?: string[];
  status?: string;
  external_id?: string;
  notes?: string;
}

export interface JobImportResponse {
  created: number;
  updated: number;
  errors: string[];
  total: number;
}

export interface JobMatchResult {
  job: JobPosting;
  matched_keywords: string[];
  match_score: number;
}

export interface JobMatchResponse {
  results: JobMatchResult[];
  total: number;
  query_keywords: string[];
}

/* ---------- Job Posting API ---------- */

export async function fetchJobs(
  q?: string,
  status?: string,
  companyId?: string,
): Promise<JobListResponse> {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (status) params.set("status", status);
  if (companyId) params.set("company_id", companyId);
  const qs = params.toString();
  return request<JobListResponse>(`/jobs${qs ? `?${qs}` : ""}`);
}

export async function createJob(data: JobCreateData): Promise<JobPosting> {
  return request<JobPosting>("/jobs", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function getJob(id: string): Promise<JobPosting> {
  return request<JobPosting>(`/jobs/${id}`);
}

export async function updateJob(
  id: string,
  data: Partial<JobCreateData>,
): Promise<JobPosting> {
  return request<JobPosting>(`/jobs/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function deleteJob(id: string): Promise<{ deleted: boolean }> {
  return request<{ deleted: boolean }>(`/jobs/${id}`, { method: "DELETE" });
}

export async function importJobs(
  rows: Array<Record<string, string>>,
): Promise<JobImportResponse> {
  return request<JobImportResponse>("/jobs/import", {
    method: "POST",
    body: JSON.stringify({ rows }),
  });
}

export async function matchJobs(
  params: { candidate_id?: string; keywords?: string[] },
): Promise<JobMatchResponse> {
  return request<JobMatchResponse>("/jobs/match", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

/* ---------- Pipedrive Deal Types ---------- */

export interface DealItem {
  id: string;
  pipedrive_deal_id: number;
  title: string;
  value: number;
  currency: string;
  pipeline_id: number;
  pipeline_name: string;
  stage_id: number;
  stage_name: string;
  stage_order: number;
  status: string;
  person_name: string;
  org_name: string;
  candidate_id: string | null;
  company_id: string | null;
  expected_close_date: string | null;
  won_time: string | null;
  lost_time: string | null;
  lost_reason: string | null;
  stage_entered_at: string;
  days_in_stage: number;
  activities_count: number;
  last_activity_date: string | null;
  owner_name: string;
  synced_at: string;
  created_at: string;
  updated_at: string;
}

export interface DealActivity {
  id: string;
  pipedrive_activity_id: number;
  deal_id: string | null;
  type: string;
  subject: string;
  note: string;
  done: boolean;
  due_date: string | null;
  duration: number | null;
  person_name: string;
  org_name: string;
  owner_name: string;
  created_at: string;
}

export interface PipelineStage {
  name: string;
  order: number;
  count: number;
  value: number;
  avg_days: number;
  deals: Array<{ id: string; title: string; person_name: string; days_in_stage: number; value: number }>;
}

export interface PipelineStatsResponse {
  stages: PipelineStage[];
  total_value: number;
  total_deals: number;
}

export interface DealDetailResponse {
  deal: DealItem;
  activities: DealActivity[];
  transcripts: Array<{ id: string; title: string; summary: string; recorded_at: string }>;
}

/* ---------- Pipedrive API ---------- */

export async function syncPipedriveDeals(): Promise<{ synced: number; message: string }> {
  return request("/pipedrive/sync/deals", { method: "POST" });
}

export async function syncPipedriveActivities(): Promise<{ synced: number; message: string }> {
  return request("/pipedrive/sync/activities", { method: "POST" });
}

export async function syncPipedrivePersons(): Promise<{ created: number; updated: number; message: string }> {
  return request("/pipedrive/sync/persons", { method: "POST" });
}

export async function fetchDeals(
  status?: string,
): Promise<{ deals: DealItem[]; total: number }> {
  const qs = status ? `?status=${status}` : "";
  return request(`/pipedrive/deals${qs}`);
}

export async function getDealDetail(id: string): Promise<DealDetailResponse> {
  return request(`/pipedrive/deals/${id}`);
}

export async function fetchStaleDeals(
  days?: number,
): Promise<{ stale_deals: DealItem[]; total: number; threshold_days: number }> {
  const qs = days ? `?days=${days}` : "";
  return request(`/pipedrive/stale${qs}`);
}

export async function fetchPipelineStats(): Promise<PipelineStatsResponse> {
  return request("/pipedrive/pipeline");
}

/* ---------- Meeting Transcript Types ---------- */

export interface MeetingTranscript {
  id: string;
  deal_id: string | null;
  candidate_id: string | null;
  title: string;
  transcript_text: string;
  summary: string | null;
  action_items: string[];
  key_points: string[];
  next_steps: string | null;
  attendees: string[];
  duration_minutes: number | null;
  source: string;
  recorded_at: string;
  created_at: string;
  updated_at: string;
}

/* ---------- Meeting API ---------- */

export async function fetchMeetings(
  dealId?: string,
  candidateId?: string,
): Promise<{ transcripts: MeetingTranscript[]; total: number }> {
  const params = new URLSearchParams();
  if (dealId) params.set("deal_id", dealId);
  if (candidateId) params.set("candidate_id", candidateId);
  const qs = params.toString();
  return request(`/meetings${qs ? `?${qs}` : ""}`);
}

export async function createMeeting(
  data: Partial<MeetingTranscript>,
): Promise<MeetingTranscript> {
  return request("/meetings", { method: "POST", body: JSON.stringify(data) });
}

export async function getMeeting(id: string): Promise<MeetingTranscript> {
  return request(`/meetings/${id}`);
}

export async function transcribeAudio(data: {
  audio_base64: string;
  mime_type?: string;
  deal_id?: string;
  candidate_id?: string;
  title?: string;
  attendees?: string[];
}): Promise<{ transcript: MeetingTranscript; raw_gemini_output: string }> {
  return request("/meetings/transcribe", { method: "POST", body: JSON.stringify(data) });
}

export async function summarizeMeeting(
  id: string,
): Promise<{ summary: string; action_items: string[]; key_points: string[] }> {
  return request(`/meetings/${id}/summarize`, { method: "POST" });
}

export async function deleteMeeting(id: string): Promise<{ deleted: boolean }> {
  return request(`/meetings/${id}`, { method: "DELETE" });
}
