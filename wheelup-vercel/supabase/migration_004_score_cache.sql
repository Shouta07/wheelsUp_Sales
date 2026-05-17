-- migration_004: 採点入力ハッシュをキャッシュキーとして保存。
-- transcript_text が変わらない限り Gemini を再呼び出ししない（無料枠保護）。

alter table meeting_transcripts
  add column if not exists score_input_hash text;

create index if not exists idx_meeting_transcripts_score_hash
  on meeting_transcripts (score_input_hash);

comment on column meeting_transcripts.score_input_hash is
  '採点に使った入力 (transcript_text + leader_refs) の SHA-256。同一なら score_data を再利用';
