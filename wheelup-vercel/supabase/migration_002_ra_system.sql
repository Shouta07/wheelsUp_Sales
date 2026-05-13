-- Wheels Up RA (Recruiting Advisor) prospecting subsystem
-- Embedded inside wheelup-vercel. Uses ra_ prefix to avoid collision with the
-- existing `companies` / `candidates` / `jobs` tables (which serve the meeting
-- feedback + pitch matching system).

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
create table if not exists ra_companies (
  id              uuid primary key default gen_random_uuid(),
  name            text not null unique,
  category        text,
  priority        text not null default 'B',
  recruit_page_url text,
  corporate_url   text,
  location        text,
  employee_size   text,
  notes           text,
  contact_paths   jsonb not null default '[]'::jsonb,
  source          text,
  last_crawled_at timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists ra_companies_priority_idx on ra_companies(priority);
create index if not exists ra_companies_category_idx on ra_companies(category);

create table if not exists ra_jobs (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references ra_companies(id) on delete cascade,
  title           text not null,
  description     text,
  requirements    text,
  employment_type text,
  location        text,
  salary_range    text,
  url             text,
  content_hash    text not null,
  is_open         boolean not null default true,
  first_seen_at   timestamptz not null default now(),
  last_seen_at    timestamptz not null default now(),
  closed_at       timestamptz,
  raw             jsonb,
  unique (company_id, content_hash)
);
create index if not exists ra_jobs_company_idx on ra_jobs(company_id);
create index if not exists ra_jobs_open_idx    on ra_jobs(is_open);

create table if not exists ra_candidates (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  name        text not null,
  headline    text,
  profile     jsonb not null default '{}'::jsonb,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists ra_matches (
  id           uuid primary key default gen_random_uuid(),
  job_id       uuid not null references ra_jobs(id) on delete cascade,
  candidate_id uuid not null references ra_candidates(id) on delete cascade,
  grade        text not null,
  score        int  not null,
  reasons      jsonb not null default '[]'::jsonb,
  concerns     jsonb not null default '[]'::jsonb,
  model        text,
  created_at   timestamptz not null default now(),
  unique (job_id, candidate_id)
);
create index if not exists ra_matches_grade_idx on ra_matches(grade);
create index if not exists ra_matches_score_idx on ra_matches(score desc);

create table if not exists ra_activities (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid references ra_companies(id) on delete cascade,
  job_id       uuid references ra_jobs(id) on delete cascade,
  candidate_id uuid references ra_candidates(id) on delete cascade,
  kind         text not null,
  channel      text,
  body         text,
  meta         jsonb not null default '{}'::jsonb,
  occurred_at  timestamptz not null default now(),
  created_by   text
);
create index if not exists ra_activities_company_idx on ra_activities(company_id);
create index if not exists ra_activities_kind_idx    on ra_activities(kind);
create index if not exists ra_activities_occurred_idx on ra_activities(occurred_at desc);

create table if not exists ra_discovery_queue (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  reason       text,
  hint_url     text,
  category     text,
  status       text not null default 'pending',
  raw          jsonb,
  created_at   timestamptz not null default now(),
  reviewed_at  timestamptz,
  promoted_company_id uuid references ra_companies(id) on delete set null
);
create index if not exists ra_discovery_queue_status_idx on ra_discovery_queue(status);

create table if not exists ra_crawl_runs (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null,
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  ok          boolean,
  stats       jsonb not null default '{}'::jsonb,
  error       text
);
create index if not exists ra_crawl_runs_started_idx on ra_crawl_runs(started_at desc);

create table if not exists ra_app_state (
  key         text primary key,
  value       jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

-- =============================================================================
-- VIEWS
-- =============================================================================

create or replace view ra_company_overview as
select
  c.id,
  c.name,
  c.category,
  c.priority,
  c.recruit_page_url,
  c.corporate_url,
  c.last_crawled_at,
  (select count(*) from ra_jobs j where j.company_id = c.id and j.is_open) as open_jobs,
  (select count(*) from ra_matches m
     join ra_jobs j on j.id = m.job_id
    where j.company_id = c.id and m.grade in ('◎','○')) as strong_matches,
  (select max(a.occurred_at) from ra_activities a where a.company_id = c.id) as last_activity_at
from ra_companies c;

create or replace view ra_ready_to_execute as
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
from ra_matches m
join ra_candidates c on c.id = m.candidate_id
join ra_jobs       j on j.id = m.job_id
join ra_companies  co on co.id = j.company_id
where m.grade in ('◎','○')
  and j.is_open
  and not exists (
    select 1 from ra_activities a
     where a.job_id = j.id
       and a.candidate_id = c.id
       and a.kind in ('sent','meeting','closed')
  )
order by
  case m.grade when '◎' then 0 else 1 end,
  m.score desc,
  case co.priority when 'S' then 0 when 'A' then 1 when 'B' then 2 else 3 end;

-- =============================================================================
-- RLS — existing schema uses "for all using (auth.role() = 'authenticated')".
-- Match that pattern so the browser (anon key + magic-link session) can read
-- ra_* once the user is signed in. The service_role used by /api/ra/* bypasses
-- RLS automatically.
-- =============================================================================

alter table ra_companies        enable row level security;
alter table ra_jobs             enable row level security;
alter table ra_candidates       enable row level security;
alter table ra_matches          enable row level security;
alter table ra_activities       enable row level security;
alter table ra_discovery_queue  enable row level security;
alter table ra_crawl_runs       enable row level security;
alter table ra_app_state        enable row level security;

create policy "Authenticated users full access" on ra_companies
  for all using (auth.role() = 'authenticated');
create policy "Authenticated users full access" on ra_jobs
  for all using (auth.role() = 'authenticated');
create policy "Authenticated users full access" on ra_candidates
  for all using (auth.role() = 'authenticated');
create policy "Authenticated users full access" on ra_matches
  for all using (auth.role() = 'authenticated');
create policy "Authenticated users full access" on ra_activities
  for all using (auth.role() = 'authenticated');
create policy "Authenticated users full access" on ra_discovery_queue
  for all using (auth.role() = 'authenticated');
create policy "Authenticated users full access" on ra_crawl_runs
  for all using (auth.role() = 'authenticated');
create policy "Authenticated users full access" on ra_app_state
  for all using (auth.role() = 'authenticated');

-- Views run with caller privileges so the policies above apply through them.
alter view ra_company_overview set (security_invoker = true);
alter view ra_ready_to_execute set (security_invoker = true);
