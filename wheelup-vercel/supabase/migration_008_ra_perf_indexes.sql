-- migration_008_ra_perf_indexes.sql
-- 実運用監査で見つかった N+1 / フルスキャン対応の複合インデックス。
--
-- 経緯:
--   ra_company_overview ビュー が各行ごとに ra_jobs, ra_matches, ra_activities へ
--   サブクエリ ((select count(*) ...)) を打つ設計。
--   246 社 × 3 サブクエリ = 738 回 / 1 ビュー読み出し。
--   既存の単列 index (company_id 単独 / kind 単独) では filter+aggregate が
--   遅いので、実際に WHERE に出る組み合わせで複合 index を張る。
--
-- 同様に ra_ready_to_execute ビュー が NOT EXISTS (ra_activities WHERE
-- job_id=... AND candidate_id=... AND kind=...) を打つので、
-- (job_id, candidate_id, kind) の複合 index で seek にする。
--
-- 既存 index と重複しないよう if not exists でガード。

-- ra_company_overview の open_jobs サブクエリ用
create index if not exists ra_jobs_company_open_idx
  on ra_jobs(company_id, is_open);

-- ra_company_overview の strong_matches サブクエリ用 (grade in ◎○)
create index if not exists ra_matches_job_grade_idx
  on ra_matches(job_id, grade);

-- ra_company_overview の last_activity_at サブクエリ用 (max(occurred_at) by company)
create index if not exists ra_activities_company_occurred_idx
  on ra_activities(company_id, occurred_at desc);

-- ra_ready_to_execute の NOT EXISTS(ra_activities ...) 用 — sent 判定が seek で済む
create index if not exists ra_activities_job_cand_kind_idx
  on ra_activities(job_id, candidate_id, kind);

-- listFollowUps の `ra_activities WHERE occurred_at >= cutoff` を高速化 (時系列)
-- 既存 ra_activities_occurred_idx と機能重複だが kind を含めることで covering に
create index if not exists ra_activities_occurred_kind_idx
  on ra_activities(occurred_at desc, kind);

-- analyze は手動で必要なら実行: vacuum analyze ra_jobs; vacuum analyze ra_matches; vacuum analyze ra_activities;
