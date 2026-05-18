-- ============================================================================
-- migration_007: ra_* テーブル/ビューに匿名ユーザー (anon) の SELECT 権を付与
-- ============================================================================
-- 背景:
--   wheelsUp の RA 開拓モードは「ログイン不要」で使う想定。Supabase Auth
--   セッションを持たないブラウザは auth.role() = 'anon' で接続する。
--   既存の "Authenticated users full access" ポリシーは authenticated 限定で
--   anon を弾くため、ブラウザ側の SELECT が全件 0 になっていた。
--   (= 進捗パネル / 企業一覧 / 候補者 / 実行待ち などが全部空)
--
-- 対応:
--   ra_* テーブルと view に anon の SELECT を許可するポリシーを追加。
--   書き込みは引き続き API (service_role) 経由のみ。anon は read-only。
--
-- セキュリティ評価:
--   anon key は JS バンドルに含まれるので公開 URL 経由でアクセス可能。
--   このため anon SELECT を開放すると企業/候補者/活動データが事実上 public 露出。
--   5 人チーム内部運用 + URL 非公開前提なので許容。
--   将来 SaaS 化する際は Supabase Auth ベースに切り替える。
-- ============================================================================

-- ── テーブル ──────────────────────────────────────────────────────────
drop policy if exists "Anon read access" on ra_companies;
create policy "Anon read access" on ra_companies for select to anon using (true);

drop policy if exists "Anon read access" on ra_jobs;
create policy "Anon read access" on ra_jobs for select to anon using (true);

drop policy if exists "Anon read access" on ra_candidates;
create policy "Anon read access" on ra_candidates for select to anon using (true);

drop policy if exists "Anon read access" on ra_matches;
create policy "Anon read access" on ra_matches for select to anon using (true);

drop policy if exists "Anon read access" on ra_activities;
create policy "Anon read access" on ra_activities for select to anon using (true);

drop policy if exists "Anon read access" on ra_discovery_queue;
create policy "Anon read access" on ra_discovery_queue for select to anon using (true);

drop policy if exists "Anon read access" on ra_crawl_runs;
create policy "Anon read access" on ra_crawl_runs for select to anon using (true);

drop policy if exists "Anon read access" on ra_app_state;
create policy "Anon read access" on ra_app_state for select to anon using (true);

-- ── ビュー (security_invoker のもとで anon が SELECT できれば OK) ──────
-- ビューは GRANT で制御
grant select on ra_company_overview to anon;
grant select on ra_ready_to_execute to anon;
