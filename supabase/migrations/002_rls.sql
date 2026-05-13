-- Row Level Security policies.
--
-- This app talks to Supabase exclusively via the service_role key on the
-- server side (Next.js API routes). The service_role key bypasses RLS, so
-- the policies below exist as a *defense in depth*:
--
--   1. If anon/authenticated keys ever leak, no row is reachable.
--   2. If someone enables direct REST access for a frontend client by
--      accident, they will get an empty result rather than full data.
--
-- The default policy for every table is: deny.
--
-- Run this AFTER 001_schema.sql.

-- ---------------------------------------------------------------------------
-- Lock down the anon / authenticated roles from PostgREST entirely.
-- All app traffic goes through service_role.
-- ---------------------------------------------------------------------------

revoke all on schema public from anon, authenticated;
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated;

alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Enable RLS on every table. service_role bypasses these; everyone else gets
-- nothing.
-- ---------------------------------------------------------------------------

alter table companies         enable row level security;
alter table jobs              enable row level security;
alter table candidates        enable row level security;
alter table matches           enable row level security;
alter table activities        enable row level security;
alter table discovery_queue   enable row level security;
alter table crawl_runs        enable row level security;

-- Force RLS even for table owners (does not affect service_role bypass).
alter table companies         force row level security;
alter table jobs              force row level security;
alter table candidates        force row level security;
alter table matches           force row level security;
alter table activities        force row level security;
alter table discovery_queue   force row level security;
alter table crawl_runs        force row level security;

-- ---------------------------------------------------------------------------
-- Explicit deny-all policies. We intentionally do not create any permissive
-- policy for anon/authenticated. If you later add a user-facing client,
-- add narrowly-scoped SELECT policies here (and re-grant only the columns
-- you want exposed).
-- ---------------------------------------------------------------------------

do $$
declare t text;
begin
  for t in
    select unnest(array[
      'companies','jobs','candidates','matches','activities',
      'discovery_queue','crawl_runs'
    ])
  loop
    execute format('drop policy if exists %I on %I', 'deny_all', t);
    execute format(
      'create policy %I on %I for all to anon, authenticated using (false) with check (false)',
      'deny_all', t
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Views: company_overview and ready_to_execute inherit RLS from base tables
-- because they are not `security definer`. Nothing to do for them, but
-- revoke direct grants to be safe.
-- ---------------------------------------------------------------------------

revoke all on company_overview from anon, authenticated;
revoke all on ready_to_execute from anon, authenticated;
