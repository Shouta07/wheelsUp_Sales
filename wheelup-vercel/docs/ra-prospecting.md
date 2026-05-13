# RA 新規開拓モード（wheelup-vercel 内蔵）

このドキュメントは、wheelup-vercel に組み込まれた「RA 新規開拓モード」の
セットアップ・運用手順を記述する。

## モード切替

ヘッダー左上に「面談FB / RA開拓」のトグルがある。選択状態は `localStorage`
の `wheelsup_active_mode` キーに保持される。

- **面談FB**: 既存の `Home`（meeting feedback 系）
- **RA開拓**: 新規追加の `ProspectingApp`（このドキュメントの対象）

## DB（Supabase）

既存の `companies` / `candidates` / `jobs` テーブルとの衝突を避けるため、
RA 用のテーブルは **すべて `ra_` プレフィックス** を付けている。

| テーブル | 役割 |
| --- | --- |
| `ra_companies`        | ターゲット企業 246 社 |
| `ra_jobs`             | クロールで取得した求人。`content_hash` で差分検知 |
| `ra_candidates`       | 4 候補者 (志村 / 宮本 / 長島 / 加藤) |
| `ra_matches`          | job × candidate の LLM 採点（◎○△× + 0-100 点） |
| `ra_activities`       | 送信 / 商談 / クローズ などの活動ログ |
| `ra_discovery_queue`  | LLM が提案した新規候補企業 |
| `ra_crawl_runs`       | crawl/match/discover/cron の実行ログ |
| `ra_app_state`        | カーソル・フィーチャーフラグなどの汎用 KV |

ビュー:
- `ra_company_overview` — 一覧用の集計（open_jobs / strong_matches / last_activity_at）
- `ra_ready_to_execute` — ◎○ かつ未送信のマッチ。「実行待ち」画面の正本

初回セットアップ:

```sql
-- Supabase SQL Editor で:
\i supabase/migration_002_ra_system.sql
```

データ投入:

```bash
curl -X POST "https://<your-app>/api/ra/import?secret=$CRON_SECRET"
```

## API（すべて `?secret=$CRON_SECRET` か `Authorization: Bearer` 必須）

ホビープラン制約に合わせ、`/api/ra/[[...path]].ts` 1 ファイルに全エンドポイントを集約：

| Method | Path | 役割 |
| --- | --- | --- |
| POST | `/api/ra/import`   | `api/_data/` の seed を upsert |
| POST | `/api/ra/crawl`    | `?limit=10` / `?company_id=...` 単発も可 |
| POST | `/api/ra/match`    | `?limit=20` / `?job_id=...` |
| POST | `/api/ra/discover` | `?count=10` |
| POST | `/api/ra/activity` | body: `{kind, company_id, job_id, candidate_id, channel, body}` |
| GET  | `/api/ra/cron`     | crawl + match を一括（Vercel Cron が叩く） |

Cron は `vercel.json` の `crons` に登録済（22:00 UTC = 07:00 JST 毎日）。
Path 内の `__REPLACE_WITH_CRON_SECRET__` は本物のシークレットに置換する。

## 環境変数（追加分）

| Key | 説明 |
| --- | --- |
| `GEMINI_API_KEY` | Gemini 採点・抽出・発掘 |
| `GEMINI_MODEL`   | 既定 `gemini-2.5-flash-lite` |
| `JINA_API_KEY`   | 任意。未設定なら通常 `fetch` にフォールバック |
| `CRON_SECRET`    | 既存の API 群とは独立した、RA 用の共有シークレット |

既存の `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` / `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` をそのまま流用する。

## モックモード

`VITE_SUPABASE_URL` が未設定の場合、ブラウザ側は `public/ra/companies_seed.csv`
と `public/ra/candidates_seed.json` を直接 fetch して 246 社 / 4 候補者を表示する。
LLM 採点・クロールはサーバ API が必要なため、モックでは ◎○ マッチは出ない
（実行待ち / 発掘キューは空）。

ヘッダー右上のバッジで現在のモード（LIVE / MOCK）が分かる。

## 候補者プロフィール

`public/ra/candidates_seed.json` に 4 名分の初期データを置く。本番では Supabase の
`ra_candidates.profile` (jsonb) が正本となり、`POST /api/ra/import` で同期される。

各プロフィールは以下のキーを持つ:

```jsonc
{
  "specialties": ["..."],
  "industries_ok": ["..."],
  "industries_ng": ["..."],
  "deal_breakers": ["..."],
  "in_progress": ["..."],
  "preferred_location": ["..."],
  "desired_salary": "750-900万円",
  "notes": "..."
}
```

## 画面

サブナビは `RA開拓` モード内のタブで切り替える:

- `ダッシュボード` — KPI + 実行待ち直近 20 件
- `実行待ち`       — ◎○ × 未送信。「送信記録」ボタンで `/api/ra/activity` に `sent` を記録
- `企業一覧`       — 246 社、優先度・カテゴリ・名前で絞り込み
- `企業詳細`       — 企業一覧の名前クリックで遷移。連絡経路 / 公開求人 / 判定 / 活動履歴
- `新規発掘`       — `discovery_queue` の pending を一覧（人手レビュー対象）

## ファイル

```
wheelup-vercel/
├ api/
│  ├ _data/{companies_seed.csv,candidates_seed.json}  ← serverless 同梱用
│  ├ _lib/{ra-gemini,ra-scrape,ra-csv}.ts
│  └ ra/[[...path]].ts                               ← 1 関数に集約
├ public/ra/{companies_seed.csv,candidates_seed.json} ← ブラウザ mock 用
├ src/
│  ├ lib/ra/{types,csv,queries}.ts
│  └ pages/ra/Prospecting{App,Home,Ready,Companies,CompanyDetail,Discovery}.tsx
└ supabase/migration_002_ra_system.sql
```
