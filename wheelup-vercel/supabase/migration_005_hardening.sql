-- =====================================================
-- Migration 005: DB 設計の本番運用前ハードニング
-- =====================================================
-- 1. meeting_transcripts.recorded_at に降順インデックス (日付フィルタ高速化)
-- 2. meeting_playbook_cache の PK を UUID 化、leader_name は UNIQUE 制約に
-- 3. ra_jobs / ra_activities に created_at / updated_at + トリガー追加
-- 4. learning_progress.user_id の auth.users 参照を解除 (Supabase Auth 廃止のため)
-- 5. 候補者名・企業名に pg_trgm インデックス (検索高速化、将来用)

-- 1. recorded_at 降順インデックス
create index if not exists idx_meeting_transcripts_recorded_at
  on meeting_transcripts (recorded_at desc);

-- consultant_name と is_leader の複合インデックス (UI が「自分の面談」「リーダー面談」で頻繁にフィルタ)
create index if not exists idx_meeting_transcripts_consultant_leader
  on meeting_transcripts (consultant_name, is_leader, recorded_at desc);

-- 2. meeting_playbook_cache の構造を堅牢化
do $$
begin
  -- id カラム追加
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'meeting_playbook_cache' and column_name = 'id'
  ) then
    alter table meeting_playbook_cache add column id uuid default gen_random_uuid();
    -- 既存行に id を埋める (DEFAULT は INSERT 時しか効かないため UPDATE で確実に)
    update meeting_playbook_cache set id = gen_random_uuid() where id is null;
    alter table meeting_playbook_cache alter column id set not null;
  end if;

  -- 既存 PK 制約 (leader_name) を剥がす
  if exists (
    select 1 from information_schema.table_constraints
    where table_name = 'meeting_playbook_cache' and constraint_type = 'PRIMARY KEY'
      and constraint_name = 'meeting_playbook_cache_pkey'
  ) then
    -- 制約名で剥がせるか確認してから
    alter table meeting_playbook_cache drop constraint meeting_playbook_cache_pkey;
  end if;

  -- id を新 PK に
  if not exists (
    select 1 from information_schema.table_constraints
    where table_name = 'meeting_playbook_cache' and constraint_type = 'PRIMARY KEY'
  ) then
    alter table meeting_playbook_cache add primary key (id);
  end if;

  -- leader_name は UNIQUE で代替 (upsert の conflict key として使えるように)
  if not exists (
    select 1 from information_schema.table_constraints
    where table_name = 'meeting_playbook_cache'
      and constraint_name = 'meeting_playbook_cache_leader_name_key'
  ) then
    alter table meeting_playbook_cache
      add constraint meeting_playbook_cache_leader_name_key unique (leader_name);
  end if;
end $$;

-- 3. ra_jobs / ra_activities に created_at / updated_at + トリガー
alter table ra_jobs
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

drop trigger if exists ra_jobs_updated_at on ra_jobs;
create trigger ra_jobs_updated_at before update on ra_jobs
  for each row execute function update_updated_at();

alter table ra_activities
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

drop trigger if exists ra_activities_updated_at on ra_activities;
create trigger ra_activities_updated_at before update on ra_activities
  for each row execute function update_updated_at();

-- 4. learning_progress.user_id の auth.users 参照を解除
-- Supabase Auth は使わず X-User-Name ヘッダ方式に統一したため、user_id FK は無効化。
-- カラム自体は後方互換のため残す (user_name で識別)。
alter table learning_progress
  drop constraint if exists learning_progress_user_id_fkey;

-- 5. トライグラム検索インデックス (将来データが増えた時の検索高速化)
create extension if not exists pg_trgm;

create index if not exists idx_candidates_name_trgm
  on candidates using gin (name gin_trgm_ops);

create index if not exists idx_ra_companies_name_trgm
  on ra_companies using gin (name gin_trgm_ops);

create index if not exists idx_ra_candidates_name_trgm
  on ra_candidates using gin (name gin_trgm_ops);

create index if not exists idx_companies_name_trgm
  on companies using gin (name gin_trgm_ops);

-- コメント
comment on index idx_meeting_transcripts_recorded_at is
  '面談を新しい順に並べる UI クエリ向け (面談ライブラリで使用)';
comment on index idx_meeting_transcripts_consultant_leader is
  '自分の面談・リーダー面談タブのフィルタ複合インデックス';
comment on constraint meeting_playbook_cache_leader_name_key on meeting_playbook_cache is
  'leader_name 単位で 1 キャッシュ。upsert の conflict key としても使う';
