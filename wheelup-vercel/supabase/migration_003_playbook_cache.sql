-- =====================================================
-- Migration 003: プレイブック生成結果のキャッシュ
-- =====================================================
-- /api/meetings/extract-playbook は Gemini を毎回叩くため、
-- 同一のソース面談セットから同じ結果を再計算するのを避ける。
--
-- cache_key は「ソース面談IDの並び + 各行の updated_at」のハッシュ。
-- ソース面談が変われば cache_key が変わるので自動的に無効化される。

create table if not exists meeting_playbook_cache (
  leader_name           text primary key,
  cache_key             text not null,
  playbook              jsonb not null,
  source_meeting_count  integer not null,
  generated_at          timestamptz not null default now()
);

create index if not exists idx_playbook_cache_generated
  on meeting_playbook_cache(generated_at desc);
