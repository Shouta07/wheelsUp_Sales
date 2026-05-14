-- =====================================================
-- Migration 004: meeting_type 追加（初回診断 CVR 強化のため）
-- =====================================================
-- 1on1 (2026-05-14) で合意した「初回診断のCVR向上」を実現するため、
-- 議事録に面談種別を追加し、初回診断だけを抽出して
-- リーダーの強み・若手とのギャップを可視化できるようにする。
--
-- type 値（緩い CHECK で運用しつつ将来の値追加に耐える）:
--   first_diagnosis : 初回診断
--   second          : 2回目以降
--   interview_prep  : 面接対策
--   closing         : クロージング
--   other           : その他
alter table meeting_transcripts
  add column if not exists meeting_type text default 'other';

alter table meeting_transcripts
  drop constraint if exists meeting_transcripts_meeting_type_check;

alter table meeting_transcripts
  add constraint meeting_transcripts_meeting_type_check
  check (meeting_type in ('first_diagnosis','second','interview_prep','closing','other'));

create index if not exists idx_transcripts_meeting_type
  on meeting_transcripts(meeting_type);

create index if not exists idx_transcripts_type_leader_recorded
  on meeting_transcripts(meeting_type, is_leader, recorded_at desc);
