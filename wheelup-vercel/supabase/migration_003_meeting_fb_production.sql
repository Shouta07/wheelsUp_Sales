-- =====================================================
-- Migration 003: 面談FB システム 実運用化
-- =====================================================
-- 1on1 (2026-05-14) で合意した内容を反映:
--  - リーダーが外部学習URLを面談へ添付できる leader_resource_url を追加
--  - 担当者ごとのスコープ（consultant_name インデックス）を強化
--  - 既存データを壊さないよう IF NOT EXISTS で冪等化

alter table meeting_transcripts
  add column if not exists leader_resource_url text,
  add column if not exists leader_resource_label text;

create index if not exists idx_transcripts_consultant_recorded
  on meeting_transcripts(consultant_name, recorded_at desc);
