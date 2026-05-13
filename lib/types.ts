// Shared domain types.

export type Rank = "◎" | "◯" | "△" | "×";

export interface Company {
  id: string;
  name: string;
  name_kana?: string | null;
  category?: string | null;
  priority: number;
  homepage_url?: string | null;
  recruit_page_url?: string | null;
  inquiry_form_url?: string | null;
  phone?: string | null;
  address?: string | null;
  employees_range?: string | null;
  capital_jpy?: number | null;
  established_year?: number | null;
  ceo_name?: string | null;
  hr_contact_name?: string | null;
  hr_contact_email?: string | null;
  hr_contact_phone?: string | null;
  notes?: string | null;
  source?: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface Job {
  id: string;
  company_id: string;
  title: string;
  url?: string | null;
  employment_type?: string | null;
  location?: string | null;
  salary_min_jpy?: number | null;
  salary_max_jpy?: number | null;
  description?: string | null;
  requirements?: string | null;
  preferred?: string | null;
  raw_snippet?: string | null;
  content_hash: string;
  is_open: boolean;
  posted_at?: string | null;
  first_seen_at: string;
  last_seen_at: string;
}

export interface Candidate {
  id: string;
  code: string;
  name: string;
  age?: number | null;
  current_status?: string | null;
  base_location?: string | null;
  desired_locations?: string[] | null;
  desired_industries?: string[] | null;
  must_have?: string | null;
  nice_to_have?: string | null;
  deal_breakers?: string | null;
  profile: Record<string, unknown>;
  is_active: boolean;
}

export interface Match {
  id: string;
  job_id: string;
  candidate_id: string;
  rank: Rank;
  score: number;
  reason?: string | null;
  concerns?: string | null;
  model?: string | null;
  evaluated_at: string;
}

export interface Activity {
  id: string;
  company_id?: string | null;
  job_id?: string | null;
  candidate_id?: string | null;
  match_id?: string | null;
  kind: string;
  channel?: string | null;
  body?: string | null;
  outcome?: string | null;
  occurred_at: string;
  created_by?: string | null;
}

export interface DiscoveryItem {
  id: string;
  name: string;
  homepage_url?: string | null;
  reason?: string | null;
  category_hint?: string | null;
  source?: string | null;
  status: string;
  reviewer_note?: string | null;
  merged_company_id?: string | null;
  created_at: string;
  reviewed_at?: string | null;
}

export interface ReadyRow {
  match_id: string;
  match_rank: Rank;
  match_score: number;
  match_reason: string | null;
  job_id: string;
  job_title: string;
  job_url: string | null;
  job_location: string | null;
  company_id: string;
  company_name: string;
  company_category: string | null;
  company_priority: number;
  hr_contact_email: string | null;
  inquiry_form_url: string | null;
  candidate_id: string;
  candidate_code: string;
  candidate_name: string;
  evaluated_at: string;
}

export interface CompanyOverview {
  id: string;
  name: string;
  category: string | null;
  priority: number;
  status: string;
  recruit_page_url: string | null;
  hr_contact_email: string | null;
  open_jobs: number;
  good_matches: number;
  last_activity_at: string | null;
  updated_at: string;
}
