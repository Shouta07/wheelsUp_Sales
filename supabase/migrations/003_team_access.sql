-- Team access policies.
--
-- Run AFTER 002_rls.sql.
--
-- Model: a tiny trusted team (5 users). Every authenticated user with an
-- email in the application's ALLOWED_EMAILS list sees all data and can
-- record activities. They CANNOT delete or modify history — only the
-- service_role (server-side cron / API) does mutations of jobs/matches.
--
-- Note: the ALLOWED_EMAILS allow-list is enforced at the application
-- layer (middleware + sessionAuth). Once a user is signed in via Supabase
-- Auth, the JWT claim `authenticated` reaches Postgres and these
-- policies apply. If you also want a hard cap at the DB level, add a
-- check like:
--
--   create policy "team_members_only" on activities
--     for select to authenticated
--     using (auth.email() = any (current_setting('app.allowed_emails')::text[]));
--
-- and configure `app.allowed_emails` via Supabase project settings.

-- Drop the deny-all policies for tables the team needs to read.
drop policy if exists deny_all on companies;
drop policy if exists deny_all on jobs;
drop policy if exists deny_all on candidates;
drop policy if exists deny_all on matches;
drop policy if exists deny_all on activities;
drop policy if exists deny_all on discovery_queue;
drop policy if exists deny_all on crawl_runs;

-- Re-grant column-level SELECT to authenticated.
grant usage on schema public to authenticated;
grant select on companies, jobs, candidates, matches, activities,
                discovery_queue, crawl_runs,
                company_overview, ready_to_execute
  to authenticated;

-- Allow INSERT on activities only — that's the one user-driven write.
grant insert on activities to authenticated;

-- anon stays fully revoked (no public site).
-- Defense-in-depth deny policies for anon remain in place.
do $$
begin
  if not exists (select 1 from pg_policies where policyname = 'deny_all_anon' and tablename = 'companies') then
    create policy deny_all_anon on companies         for all to anon using (false) with check (false);
    create policy deny_all_anon on jobs              for all to anon using (false) with check (false);
    create policy deny_all_anon on candidates        for all to anon using (false) with check (false);
    create policy deny_all_anon on matches           for all to anon using (false) with check (false);
    create policy deny_all_anon on activities        for all to anon using (false) with check (false);
    create policy deny_all_anon on discovery_queue   for all to anon using (false) with check (false);
    create policy deny_all_anon on crawl_runs        for all to anon using (false) with check (false);
  end if;
end $$;

-- Authenticated SELECT policies — every authed user reads everything.
create policy team_read on companies         for select to authenticated using (true);
create policy team_read on jobs              for select to authenticated using (true);
create policy team_read on candidates        for select to authenticated using (true);
create policy team_read on matches           for select to authenticated using (true);
create policy team_read on activities        for select to authenticated using (true);
create policy team_read on discovery_queue   for select to authenticated using (true);
create policy team_read on crawl_runs        for select to authenticated using (true);

-- Authenticated users may only insert activities. created_by is forced to
-- match their auth.email() so they can't impersonate someone else.
create policy team_insert_activities on activities
  for insert to authenticated
  with check (
    created_by is null
    or created_by = auth.email()
    or created_by = auth.uid()::text
  );
