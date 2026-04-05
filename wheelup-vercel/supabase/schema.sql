-- =====================================================
-- wheelsUp Sales Enablement — Supabase Schema
-- =====================================================
-- Supabase ダッシュボード > SQL Editor で実行してください

-- 1. pgvector 拡張を有効化（ベクトル検索用）
create extension if not exists vector;

-- =====================================================
-- 紹介企業テーブル
-- =====================================================
create table if not exists companies (
  id uuid primary key default gen_random_uuid(),
  pipedrive_org_id integer unique,
  name text not null,
  industry text,
  address text,
  description text,
  keywords text[] default '{}',
  pitch_points jsonb default '{}',
  people_count integer default 0,
  open_deals_count integer default 0,
  won_deals_count integer default 0,
  synced_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_companies_name on companies(name);

-- =====================================================
-- 候補者カルテ
-- =====================================================
create type candidate_status as enum (
  'new', 'in_progress', 'placed', 'on_hold', 'lost'
);
create type follow_up_priority as enum ('high', 'medium', 'low');

create table if not exists candidates (
  id uuid primary key default gen_random_uuid(),
  pipedrive_person_id integer unique,
  pipedrive_deal_id integer,
  name text not null,
  email text,
  phone text,
  age integer,
  current_company text,
  current_position text,
  current_industry text,
  years_of_experience integer,
  current_salary integer,
  qualifications text[] default '{}',
  desired_keywords text[] default '{}',
  desired_salary integer,
  desired_location text,
  desired_position text,
  inferred_needs jsonb default '{}',
  matched_companies jsonb default '[]',
  meeting_notes text,
  status candidate_status default 'new',
  follow_up_date timestamptz,
  follow_up_priority follow_up_priority default 'medium',
  follow_up_notes text,
  last_contact_date timestamptz,
  days_since_contact integer default 0,
  action_history jsonb default '[]',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_candidates_status on candidates(status);
create index idx_candidates_follow_up on candidates(follow_up_date)
  where status not in ('placed', 'lost');

-- =====================================================
-- 業界カテゴリ（土木/建築 タクソノミー）
-- =====================================================
create table if not exists industry_categories (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references industry_categories(id),
  name text not null,
  slug text unique not null,
  level integer not null,
  description text,
  market_overview text,
  key_players text[] default '{}',
  typical_roles text[] default '{}',
  required_qualifications text[] default '{}',
  salary_range text,
  growth_trend text,
  selling_points jsonb default '[]',
  pain_points jsonb default '[]',
  talking_tips text,
  sort_order integer default 0,
  updated_at timestamptz default now()
);

-- =====================================================
-- 資格マスタ
-- =====================================================
create table if not exists qualifications (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  category text,
  field text,
  difficulty text,
  description text,
  market_value text,
  salary_impact text,
  related_roles text[] default '{}',
  exam_info text,
  tips_for_consultant text
);

-- =====================================================
-- 学習進捗
-- =====================================================
create table if not exists learning_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  user_name text not null,
  category_id uuid references industry_categories(id),
  qualification_id uuid references qualifications(id),
  completed boolean default false,
  quiz_score integer,
  studied_at timestamptz default now()
);

-- =====================================================
-- Lark メッセージ（ナレッジベース）
-- =====================================================
create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  lark_message_id text unique,
  chat_id text,
  chat_name text,
  chat_type text,
  sender_id text,
  sender_name text,
  content text,
  created_at timestamptz default now(),
  indexed_at timestamptz
);

create index idx_messages_chat on messages(chat_id, created_at);

-- =====================================================
-- チャンク（ベクトル検索用）
-- =====================================================
create table if not exists chunks (
  id uuid primary key default gen_random_uuid(),
  message_id uuid references messages(id) on delete cascade,
  chunk_text text,
  chunk_index integer,
  entities jsonb default '{}',
  pipedrive_deal_id integer,
  embedding vector(1536),
  created_at timestamptz default now()
);

create index idx_chunks_deal on chunks(pipedrive_deal_id);

-- ベクトル検索用のインデックス (IVFFlat)
create index idx_chunks_embedding on chunks
  using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- =====================================================
-- チャンネル↔案件マッピング
-- =====================================================
create table if not exists channel_deal_mapping (
  id uuid primary key default gen_random_uuid(),
  chat_id text not null,
  pipedrive_deal_id integer not null,
  created_at timestamptz default now()
);

-- =====================================================
-- RLS (Row Level Security) — Supabase Auth 連携
-- =====================================================
-- 全テーブルに RLS を有効化し、認証済みユーザーのみアクセス可能にする

alter table companies enable row level security;
alter table candidates enable row level security;
alter table industry_categories enable row level security;
alter table qualifications enable row level security;
alter table learning_progress enable row level security;
alter table messages enable row level security;
alter table chunks enable row level security;
alter table channel_deal_mapping enable row level security;

-- 認証済みユーザーは全操作可能
create policy "Authenticated users full access" on companies
  for all using (auth.role() = 'authenticated');
create policy "Authenticated users full access" on candidates
  for all using (auth.role() = 'authenticated');
create policy "Authenticated users full access" on industry_categories
  for all using (auth.role() = 'authenticated');
create policy "Authenticated users full access" on qualifications
  for all using (auth.role() = 'authenticated');
create policy "Authenticated users full access" on learning_progress
  for all using (auth.role() = 'authenticated');
create policy "Authenticated users full access" on messages
  for all using (auth.role() = 'authenticated');
create policy "Authenticated users full access" on chunks
  for all using (auth.role() = 'authenticated');
create policy "Authenticated users full access" on channel_deal_mapping
  for all using (auth.role() = 'authenticated');

-- =====================================================
-- ベクトル類似検索関数
-- =====================================================
create or replace function match_chunks(
  query_embedding vector(1536),
  match_count int default 10,
  filter_deal_id int default null
)
returns table (
  id uuid,
  chunk_text text,
  entities jsonb,
  pipedrive_deal_id int,
  chat_type text,
  sender_name text,
  chat_name text,
  created_at timestamptz,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    c.id,
    c.chunk_text,
    c.entities,
    c.pipedrive_deal_id,
    m.chat_type,
    m.sender_name,
    m.chat_name,
    m.created_at,
    1 - (c.embedding <=> query_embedding) as similarity
  from chunks c
  left join messages m on m.id = c.message_id
  where (filter_deal_id is null or c.pipedrive_deal_id = filter_deal_id)
  order by c.embedding <=> query_embedding
  limit match_count;
end;
$$;

-- =====================================================
-- 求人テーブル
-- =====================================================
create table if not exists job_postings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) on delete set null,
  title text not null,
  position_type text,
  industry_category_slug text,
  employment_type text default '正社員',
  salary_min integer,
  salary_max integer,
  location text,
  description text,
  requirements text[] default '{}',
  preferred text[] default '{}',
  required_qualifications text[] default '{}',
  benefits text,
  keywords text[] default '{}',
  status text default 'open',
  source text default 'manual',
  external_id text,
  notes text,
  published_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_job_postings_status on job_postings(status);
create index idx_job_postings_company on job_postings(company_id);
create index idx_job_postings_external on job_postings(external_id)
  where external_id is not null;

alter table job_postings enable row level security;
create policy "Authenticated users full access" on job_postings
  for all using (auth.role() = 'authenticated');

-- =====================================================
-- updated_at 自動更新トリガー
-- =====================================================
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger companies_updated_at before update on companies
  for each row execute function update_updated_at();
create trigger candidates_updated_at before update on candidates
  for each row execute function update_updated_at();
create trigger industry_categories_updated_at before update on industry_categories
  for each row execute function update_updated_at();
create trigger job_postings_updated_at before update on job_postings
  for each row execute function update_updated_at();
