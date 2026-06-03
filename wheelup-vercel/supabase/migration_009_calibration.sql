-- =====================================================
-- Migration 009: リーダー校正データ (採点アンカー)
-- =====================================================
-- リーダー (小林) が「この面談は良い/悪い」と判定したデータを保存。
-- AI 採点プロンプトに few-shot アンカーとして注入され、
-- 「現場感覚と AI 評価のズレ」を構造的に解消する。

alter table meeting_transcripts
  add column if not exists calibration jsonb;

comment on column meeting_transcripts.calibration is
  'リーダー校正データ。{ quality: "good"|"bad", comment: text, target_scores: jsonb?, marked_by: text, marked_at: iso }';

-- 校正済み議事録を高速に引くためのインデックス
-- (採点時に毎回 calibration is not null を引くため)
create index if not exists idx_meeting_transcripts_calibration
  on meeting_transcripts ((calibration->>'quality'))
  where calibration is not null and deleted_at is null;
