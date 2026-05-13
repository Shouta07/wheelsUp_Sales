-- Wheels Up Sales / RA prospecting schema
-- 8 tables + 2 views. Designed for Supabase REST (PostgREST).

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- companies
-- ---------------------------------------------------------------------------
create table if not exists companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  name_kana text,
  category text,                -- 例: 設備工事 / FM / PM / 施設管理 / メーカー / その他
  priority integer not null default 3,  -- 1..5 (5=最優先)
  homepage_url text,
  recruit_page_url text,
  inquiry_form_url text,
  phone text,
  address text,
  employees_range text,
  capital_jpy bigint,
  established_year integer,
  ceo_name text,
  hr_contact_name text,
  hr_contact_email text,
  hr_contact_phone text,
  notes text,
  source text,                  -- どこから入ったか（seed / discovery / manual）
  status text not null default 'active', -- active / paused / archived
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists companies_priority_idx on companies (priority desc, name);
create index if not exists companies_category_idx on companies (category);
create index if not exists companies_status_idx on companies (status);

-- ---------------------------------------------------------------------------
-- jobs（求人）
-- ---------------------------------------------------------------------------
create table if not exists jobs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  title text not null,
  url text,
  employment_type text,         -- 正社員 / 契約 / 派遣 / 業務委託
  location text,
  salary_min_jpy integer,
  salary_max_jpy integer,
  description text,
  requirements text,
  preferred text,
  raw_snippet text,
  content_hash text not null,   -- 差分検知用
  is_open boolean not null default true,
  posted_at date,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists jobs_company_hash_idx on jobs (company_id, content_hash);
create index if not exists jobs_company_idx on jobs (company_id);
create index if not exists jobs_open_idx on jobs (is_open);

-- ---------------------------------------------------------------------------
-- candidates（候補者）
-- ---------------------------------------------------------------------------
create table if not exists candidates (
  id uuid primary key default gen_random_uuid(),
  code text unique,             -- shimura / miyamoto / nagashima / kato
  name text not null,
  age integer,
  current_status text,          -- 在職中 / 離職中 / 来月退職予定 など
  base_location text,
  desired_locations text[],
  desired_industries text[],
  must_have text,
  nice_to_have text,
  deal_breakers text,
  profile jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- matches（job × candidate）
-- ---------------------------------------------------------------------------
create table if not exists matches (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs(id) on delete cascade,
  candidate_id uuid not null references candidates(id) on delete cascade,
  rank text not null,           -- ◎ / ◯ / △ / ×
  score integer not null,       -- 0..100
  reason text,
  concerns text,
  model text,
  evaluated_at timestamptz not null default now(),
  unique (job_id, candidate_id)
);

create index if not exists matches_rank_idx on matches (rank);
create index if not exists matches_score_idx on matches (score desc);

-- ---------------------------------------------------------------------------
-- activities（送信・商談などの活動ログ）
-- ---------------------------------------------------------------------------
create table if not exists activities (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) on delete cascade,
  job_id uuid references jobs(id) on delete set null,
  candidate_id uuid references candidates(id) on delete set null,
  match_id uuid references matches(id) on delete set null,
  kind text not null,           -- proposal_sent / reply / meeting / pass / hire / note
  channel text,                 -- email / form / phone / linkedin / other
  body text,
  outcome text,
  occurred_at timestamptz not null default now(),
  created_by text,
  created_at timestamptz not null default now()
);

create index if not exists activities_company_idx on activities (company_id, occurred_at desc);
create index if not exists activities_match_idx on activities (match_id);

-- ---------------------------------------------------------------------------
-- discovery_queue（LLMが提案 → 人手レビュー前）
-- ---------------------------------------------------------------------------
create table if not exists discovery_queue (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  homepage_url text,
  reason text,
  category_hint text,
  source text,                  -- gemini / manual
  status text not null default 'pending',  -- pending / approved / rejected / merged
  reviewer_note text,
  merged_company_id uuid references companies(id) on delete set null,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create index if not exists discovery_status_idx on discovery_queue (status, created_at desc);

-- ---------------------------------------------------------------------------
-- crawl_runs（クロール実行ログ）
-- ---------------------------------------------------------------------------
create table if not exists crawl_runs (
  id uuid primary key default gen_random_uuid(),
  kind text not null,           -- crawl / match / discover / cron / import
  status text not null,         -- running / ok / error
  stats jsonb not null default '{}'::jsonb,
  error text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists crawl_runs_started_idx on crawl_runs (started_at desc);

-- ---------------------------------------------------------------------------
-- views
-- ---------------------------------------------------------------------------
create or replace view company_overview as
select
  c.id,
  c.name,
  c.category,
  c.priority,
  c.status,
  c.recruit_page_url,
  c.hr_contact_email,
  (select count(*) from jobs j where j.company_id = c.id and j.is_open) as open_jobs,
  (select count(*) from matches m
     join jobs j on j.id = m.job_id
    where j.company_id = c.id and m.rank in ('◎','◯')) as good_matches,
  (select max(occurred_at) from activities a where a.company_id = c.id) as last_activity_at,
  c.updated_at
from companies c;

-- ◎◯ match で、まだ proposal_sent が無いもの（=送るべき行）
create or replace view ready_to_execute as
select
  m.id           as match_id,
  m.rank         as match_rank,
  m.score        as match_score,
  m.reason       as match_reason,
  j.id           as job_id,
  j.title        as job_title,
  j.url          as job_url,
  j.location     as job_location,
  c.id           as company_id,
  c.name         as company_name,
  c.category     as company_category,
  c.priority     as company_priority,
  c.hr_contact_email,
  c.inquiry_form_url,
  cand.id        as candidate_id,
  cand.code      as candidate_code,
  cand.name      as candidate_name,
  m.evaluated_at
from matches m
join jobs j   on j.id = m.job_id
join companies c on c.id = j.company_id
join candidates cand on cand.id = m.candidate_id
where m.rank in ('◎','◯')
  and j.is_open
  and c.status = 'active'
  and not exists (
    select 1 from activities a
     where a.match_id = m.id
       and a.kind in ('proposal_sent','meeting','hire','pass')
  )
order by
  case m.rank when '◎' then 0 else 1 end,
  c.priority desc,
  m.score desc;
