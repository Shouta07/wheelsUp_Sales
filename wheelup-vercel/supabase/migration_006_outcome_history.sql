-- =====================================================
-- Migration 006: CVR 改善エンジン化 + データ堅牢化
-- =====================================================
-- A. 面談アウトカム (この面談から応募/採用に進んだか) を保存
-- B. 採点履歴を score_history テーブルに退避 → 成長推移トラッキング
-- C. 論理削除 (deleted_at) で誤削除からの復元を可能に
-- D. CVR 集計用インデックス

-- A. outcome カラム
alter table meeting_transcripts
  add column if not exists outcome jsonb;

comment on column meeting_transcripts.outcome is
  '面談の成果。{ next_meeting: bool, applied: bool, hired: bool, lost: bool, lost_reason: string, recorded_at: iso }';

-- B. score_history テーブル
-- meeting_id への参照は **ON DELETE SET NULL** にして、面談削除時も履歴は残す。
create table if not exists score_history (
  id              uuid primary key default gen_random_uuid(),
  meeting_id      uuid references meeting_transcripts(id) on delete set null,
  meeting_title   text,
  consultant_name text,
  score_data      jsonb not null,
  source          text not null default 'ai',
  scored_by       text,
  scored_at       timestamptz not null default now()
);

create index if not exists idx_score_history_meeting on score_history(meeting_id, scored_at desc);
create index if not exists idx_score_history_consultant on score_history(consultant_name, scored_at desc);

comment on table score_history is
  '採点履歴。meeting_transcripts.score_data を上書きする前に snapshot を取る。面談を物理削除しても履歴は残る';

-- C. 論理削除カラム
alter table meeting_transcripts
  add column if not exists deleted_at timestamptz;

create index if not exists idx_meeting_transcripts_active
  on meeting_transcripts (consultant_name, is_leader, recorded_at desc)
  where deleted_at is null;

comment on column meeting_transcripts.deleted_at is
  '論理削除タイムスタンプ。null なら有効、値ありはゴミ箱状態 (UI 非表示・30日後に物理削除可能)';

-- D. CVR 集計用インデックス
create index if not exists idx_meeting_transcripts_consultant_score
  on meeting_transcripts (consultant_name, recorded_at desc)
  where score_data is not null and deleted_at is null;

alter table score_history enable row level security;

drop policy if exists "score_history authenticated full access" on score_history;
create policy "score_history authenticated full access" on score_history
  for all using (true) with check (true);
