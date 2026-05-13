-- =====================================================
-- Migration 003: meeting score status + audit fields
-- =====================================================
-- Adds reliability instrumentation to meeting_transcripts:
--   * score_status:   'pending' | 'scoring' | 'scored' | 'failed'
--   * score_attempts: how many times scoring has been tried
--   * score_error:    last failure reason (truncated)
--   * created_by:     email of the user who recorded the meeting
--
-- These let the frontend show "採点中…" / "再採点" without resorting to
-- hardcoded setTimeout polling, and let the runbook investigate failed
-- scorings.

alter table meeting_transcripts
  add column if not exists score_status text default 'pending'
    check (score_status in ('pending', 'scoring', 'scored', 'failed'));

alter table meeting_transcripts
  add column if not exists score_attempts integer not null default 0;

alter table meeting_transcripts
  add column if not exists score_error text;

alter table meeting_transcripts
  add column if not exists created_by text;

-- Backfill: if score_data already exists treat as scored, else pending.
update meeting_transcripts
   set score_status = case
     when score_data is not null and score_data ? 'scores' then 'scored'
     else coalesce(score_status, 'pending')
   end
 where score_status is null
    or (score_status = 'pending' and score_data is not null);

create index if not exists idx_transcripts_score_status
  on meeting_transcripts(score_status)
  where score_status in ('pending', 'scoring', 'failed');
