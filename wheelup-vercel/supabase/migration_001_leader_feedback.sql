-- =====================================================
-- Migration 001: leader_feedback カラム追加
-- =====================================================
-- 既存の meeting_transcripts テーブルに leader_feedback カラムを追加
-- 小林リーダーが各メンバーの面談に直接フィードバックを入力するため

alter table meeting_transcripts
  add column if not exists leader_feedback text;

-- consultant_name での検索を高速化（チーム別表示用）
create index if not exists idx_transcripts_consultant
  on meeting_transcripts(consultant_name);

-- is_leader での検索を高速化（リーダー面談フィルタ用）
create index if not exists idx_transcripts_leader
  on meeting_transcripts(is_leader);
