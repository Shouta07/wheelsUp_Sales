-- Wheels Up RA prospecting — initial schema
-- Run order: enable extensions → tables → indexes → views

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 1. companies (target firms — FM / PM / 建築設備 / 施設管理)
-- ---------------------------------------------------------------------------
create table if not exists companies (
  id              uuid primary key default gen_random_uuid(),
  name            text not null unique,
  category        text,                 -- FM / PM / 建築設備 / 施設管理 / ゼネコン etc.
  priority        text not null default 'B',  -- S / A / B / C
  recruit_page_url text,
  corporate_url   text,
  location        text,
  employee_size   text,
  notes           text,
  contact_paths   jsonb not null default '[]'::jsonb,
  source          text,                 -- 'seed' / 'discovery' / 'manual'
  last_crawled_at timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists companies_priority_idx on companies(priority);
create index if not exists companies_category_idx on companies(category);

-- ---------------------------------------------------------------------------
-- 2. jobs (recruitment openings discovered on a company's recruit page)
-- ---------------------------------------------------------------------------
create table if not exists jobs (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references companies(id) on delete cascade,
  title           text not null,
  description     text,
  requirements    text,
  employment_type text,
  location        text,
  salary_range    text,
  url             text,
  content_hash    text not null,        -- sha256 of normalised body, for diff detection
  is_open         boolean not null default true,
  first_seen_at   timestamptz not null default now(),
  last_seen_at    timestamptz not null default now(),
  closed_at       timestamptz,
  raw             jsonb,
  unique (company_id, content_hash)
);

create index if not exists jobs_company_idx on jobs(company_id);
create index if not exists jobs_open_idx    on jobs(is_open);

-- ---------------------------------------------------------------------------
-- 3. candidates (our own 4 RA-target talents)
-- ---------------------------------------------------------------------------
create table if not exists candidates (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,     -- 'shimura' / 'miyamoto' / 'nagashima' / 'kato'
  name        text not null,
  headline    text,
  profile     jsonb not null default '{}'::jsonb,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 4. matches (job × candidate scoring by LLM)
-- ---------------------------------------------------------------------------
create table if not exists matches (
  id           uuid primary key default gen_random_uuid(),
  job_id       uuid not null references jobs(id) on delete cascade,
  candidate_id uuid not null references candidates(id) on delete cascade,
  grade        text not null,             -- '◎' / '○' / '△' / '×'
  score        int  not null,             -- 0..100
  reasons      jsonb not null default '[]'::jsonb,
  concerns     jsonb not null default '[]'::jsonb,
  model        text,
  created_at   timestamptz not null default now(),
  unique (job_id, candidate_id)
);

create index if not exists matches_grade_idx on matches(grade);
create index if not exists matches_score_idx on matches(score desc);

-- ---------------------------------------------------------------------------
-- 5. activities (sales activity log — sent / replied / meeting / closed ...)
-- ---------------------------------------------------------------------------
create table if not exists activities (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid references companies(id) on delete cascade,
  job_id       uuid references jobs(id) on delete cascade,
  candidate_id uuid references candidates(id) on delete cascade,
  kind         text not null,           -- 'sent' / 'replied' / 'meeting' / 'closed' / 'note'
  channel      text,                    -- 'email' / 'form' / 'linkedin' / 'phone'
  body         text,
  meta         jsonb not null default '{}'::jsonb,
  occurred_at  timestamptz not null default now(),
  created_by   text
);

create index if not exists activities_company_idx on activities(company_id);
create index if not exists activities_kind_idx    on activities(kind);
create index if not exists activities_occurred_idx on activities(occurred_at desc);

-- ---------------------------------------------------------------------------
-- 6. discovery_queue (LLM-suggested companies pending human review)
-- ---------------------------------------------------------------------------
create table if not exists discovery_queue (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  reason       text,
  hint_url     text,
  category     text,
  status       text not null default 'pending', -- pending / approved / rejected / promoted
  raw          jsonb,
  created_at   timestamptz not null default now(),
  reviewed_at  timestamptz,
  promoted_company_id uuid references companies(id) on delete set null
);

create index if not exists discovery_queue_status_idx on discovery_queue(status);

-- ---------------------------------------------------------------------------
-- 7. crawl_runs (operational log of crawl/match/discover invocations)
-- ---------------------------------------------------------------------------
create table if not exists crawl_runs (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null,            -- 'crawl' / 'match' / 'discover' / 'cron'
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  ok          boolean,
  stats       jsonb not null default '{}'::jsonb,
  error       text
);

create index if not exists crawl_runs_started_idx on crawl_runs(started_at desc);

-- ---------------------------------------------------------------------------
-- 8. (no 8th table — using 7 + 2 views for the "8 tables + 2 views" target)
--     The system prompt mentions 8 tables; we include `app_state` as a
--     general-purpose key/value store for cron cursors and feature flags.
-- ---------------------------------------------------------------------------
create table if not exists app_state (
  key         text primary key,
  value       jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

-- ===========================================================================
-- VIEWS
-- ===========================================================================

-- company_overview — per-company aggregates for the dashboard list
create or replace view company_overview as
select
  c.id,
  c.name,
  c.category,
  c.priority,
  c.recruit_page_url,
  c.corporate_url,
  c.last_crawled_at,
  (select count(*) from jobs j where j.company_id = c.id and j.is_open) as open_jobs,
  (select count(*) from matches m
     join jobs j on j.id = m.job_id
    where j.company_id = c.id and m.grade in ('◎','○')) as strong_matches,
  (select max(a.occurred_at) from activities a where a.company_id = c.id) as last_activity_at
from companies c;

-- ready_to_execute — open ◎/○ matches that have not yet been "sent"
create or replace view ready_to_execute as
select
  m.id              as match_id,
  m.grade,
  m.score,
  m.reasons,
  m.concerns,
  c.id              as candidate_id,
  c.code            as candidate_code,
  c.name            as candidate_name,
  j.id              as job_id,
  j.title           as job_title,
  j.url             as job_url,
  j.location        as job_location,
  co.id             as company_id,
  co.name           as company_name,
  co.priority       as company_priority,
  co.category       as company_category,
  co.contact_paths  as company_contact_paths
from matches m
join candidates c on c.id = m.candidate_id
join jobs       j on j.id = m.job_id
join companies  co on co.id = j.company_id
where m.grade in ('◎','○')
  and j.is_open
  and not exists (
    select 1 from activities a
     where a.job_id = j.id
       and a.candidate_id = c.id
       and a.kind in ('sent','meeting','closed')
  )
order by
  case m.grade when '◎' then 0 else 1 end,
  m.score desc,
  case co.priority when 'S' then 0 when 'A' then 1 when 'B' then 2 else 3 end;
