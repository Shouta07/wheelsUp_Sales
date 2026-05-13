export type Priority = "S" | "A" | "B" | "C";
export type Grade = "◎" | "○" | "△" | "×";

export type ContactPath = {
  kind: "form" | "email" | "linkedin" | "phone" | "other";
  url?: string;
  value?: string;
  note?: string;
};

export type Company = {
  id: string;
  name: string;
  category: string | null;
  priority: Priority;
  recruit_page_url: string | null;
  corporate_url: string | null;
  location: string | null;
  employee_size: string | null;
  notes: string | null;
  contact_paths: ContactPath[];
  source: string | null;
  last_crawled_at: string | null;
};

export type CompanyOverview = {
  id: string;
  name: string;
  category: string | null;
  priority: Priority;
  recruit_page_url: string | null;
  corporate_url: string | null;
  last_crawled_at: string | null;
  open_jobs: number;
  strong_matches: number;
  last_activity_at: string | null;
};

export type Job = {
  id: string;
  company_id: string;
  title: string;
  description: string | null;
  requirements: string | null;
  employment_type: string | null;
  location: string | null;
  salary_range: string | null;
  url: string | null;
  is_open: boolean;
  last_seen_at: string;
};

export type CandidateProfile = {
  specialties?: string[];
  industries_ok?: string[];
  industries_ng?: string[];
  deal_breakers?: string[];
  in_progress?: string[];
  preferred_location?: string[];
  desired_salary?: string;
  notes?: string;
};

export type Candidate = {
  id: string;
  code: string;
  name: string;
  headline: string | null;
  profile: CandidateProfile;
  is_active: boolean;
};

export type ReadyRow = {
  match_id: string;
  grade: Grade;
  score: number;
  reasons: string[];
  concerns: string[];
  candidate_id: string;
  candidate_code: string;
  candidate_name: string;
  job_id: string;
  job_title: string;
  job_url: string | null;
  job_location: string | null;
  company_id: string;
  company_name: string;
  company_priority: Priority;
  company_category: string | null;
  company_contact_paths: ContactPath[];
};

export type Activity = {
  id: string;
  company_id: string | null;
  job_id: string | null;
  candidate_id: string | null;
  kind: string;
  channel: string | null;
  body: string | null;
  meta: Record<string, unknown>;
  occurred_at: string;
};

// Flat row for the "募集ポジション一覧" page — one row per (open) job,
// pre-joined with its company so the UI can render a single list.
export type JobWithCompany = {
  job_id: string;
  job_title: string;
  job_url: string | null;
  description: string | null;
  requirements: string | null;
  employment_type: string | null;
  location: string | null;
  salary_range: string | null;
  last_seen_at: string;
  is_open: boolean;
  company_id: string;
  company_name: string;
  company_priority: Priority;
  company_category: string | null;
  recruit_page_url: string | null;
  contact_form_url: string | null;
  contact_email: string | null;
  best_grade: Grade | null;
  best_score: number | null;
  best_candidate_name: string | null;
};

export type DiscoveryRow = {
  id: string;
  name: string;
  reason: string | null;
  hint_url: string | null;
  category: string | null;
  status: "pending" | "approved" | "rejected" | "promoted";
  created_at: string;
};
