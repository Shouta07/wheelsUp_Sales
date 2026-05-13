# Wheels Up Prospecting

RA（リクルーティング・アドバイザー）の新規開拓を自動化する社内ツール。
建築設備 / FM / PM / 施設管理 / ゼネコン 領域の **246社 × 4 候補者** を
Gemini で日々スコアリングし、◎○ マッチを「実行待ち」リストとして提示する。

- **Stack**: Next.js 15 (App Router) / React 19 / TypeScript strict / Tailwind /
  Supabase REST (SDK 不使用) / Gemini 2.5 Flash Lite / Jina Reader
- **Auth**: 当面は `?secret=CRON_SECRET` クエリ認証のみ（後で Supabase Auth に拡張予定）
- **noindex**: 社内ツールのため `X-Robots-Tag: noindex, nofollow` を全 path で返す

## 起動

```bash
cd wheelup-prospecting
cp .env.example .env.local        # 環境変数なしでもモックで動く
npm install
npm run dev                       # → http://localhost:3000
```

環境変数を何も設定しなくても、`data/companies_seed.csv` と
`data/candidates_seed.json` から 246社 / 4候補者がモックモードで表示される。

ヘッダー右の `LIVE (Supabase)` / `MOCK (CSV/JSON)` バッジで現在のモードが分かる。

## 環境変数

| Key | 説明 |
| --- | --- |
| `SUPABASE_URL`            | 例: `https://xxx.supabase.co`（未設定だとモード MOCK） |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role キー。RLS をバイパスするのでサーバ側のみ |
| `GEMINI_API_KEY`          | Google AI Studio で発行 |
| `GEMINI_MODEL`            | 既定 `gemini-2.5-flash-lite` |
| `JINA_API_KEY`            | 任意。未設定なら通常 `fetch` にフォールバック |
| `CRON_SECRET`             | 全 API エンドポイントの共有シークレット |

## DB セットアップ

Supabase プロジェクトを作って `supabase/migrations/001_schema.sql` を実行。
8 テーブル（`companies` / `jobs` / `candidates` / `matches` / `activities` /
`discovery_queue` / `crawl_runs` / `app_state`）と 2 ビュー
（`company_overview` / `ready_to_execute`）が作成される。

その後 246 社と 4 候補者を投入：

```bash
curl -X POST "https://<your-app>/api/import?secret=$CRON_SECRET"
```

## API（すべて `?secret=$CRON_SECRET` 必須）

| Method | Path | 役割 |
| --- | --- | --- |
| POST | `/api/import`   | seed CSV/JSON を `companies` と `candidates` に upsert |
| POST | `/api/crawl`    | `companies.recruit_page_url` を Jina で取得 → Gemini で求人抽出 → `jobs` upsert（`content_hash` で差分検知） |
| POST | `/api/match`    | 直近 open な job × 4 候補を Gemini で ◎○△× + 0-100 採点 → `matches` |
| POST | `/api/discover` | Gemini に「既知 246 社以外の有力企業」を提案させて `discovery_queue` へ |
| POST | `/api/activity` | 送信/商談/クローズ などの活動ログを `activities` へ |
| GET  | `/api/cron`     | crawl + match を一括実行（Vercel Cron が叩く） |

クエリパラメータ:
- `/api/crawl?limit=10&company_id=<uuid>` 単発デバッグ可
- `/api/match?limit=20&job_id=<uuid>` 同上
- `/api/discover?count=10`

## Cron

`vercel.json` に登録済（22:00 UTC = 07:00 JST 毎日）。
シークレットを `?secret=` で渡せないテナントの場合は、Vercel の
`Authorization: Bearer $CRON_SECRET` ヘッダ経由でも受け付ける。

```json
{
  "crons": [
    { "path": "/api/cron?secret=__REPLACE_WITH_CRON_SECRET__", "schedule": "0 22 * * *" }
  ]
}
```

デプロイ前に `__REPLACE_WITH_CRON_SECRET__` を本物の値に書き換える
（または Vercel のシークレットヘッダ経由に切り替える）。

## 画面

- `/`               ダッシュボード（KPI + 実行待ち直近 20 件）
- `/ready`          実行待ち全件（◎○ × 未送信）。「送信記録」ボタンで `/api/activity` 経由で `sent` を残す
- `/companies`      246 社一覧（優先度・カテゴリ・名前で絞り込み）
- `/companies/[id]` 個社詳細（連絡経路・公開求人・◎○△× 判定・活動履歴）
- `/discovery`      LLM による新規発掘キュー（人手レビュー対象）

## 候補者（4 名）

- **志村** — FM/PM、空調・電気の改修PM
- **宮本** — サブコン機械設備（空調・衛生）施工管理
- **長島** — ゼネコン建築施工管理（DC / 物流の大型案件）
- **加藤** — ビル管理・設備保全のチーフマネジャー

`data/candidates_seed.json` で `specialties / industries_ok / deal_breakers /
in_progress` 等を保持。本番では Supabase の `candidates.profile` (jsonb) が
正本となる。

## ファイル構成

```
wheelup-prospecting/
├ app/
│  ├ api/{import,crawl,match,discover,activity,cron}/route.ts
│  ├ ready/page.tsx       ready/mark-sent.tsx
│  ├ companies/page.tsx   companies/[id]/page.tsx
│  ├ discovery/page.tsx
│  ├ layout.tsx           page.tsx (= dashboard)   globals.css
├ lib/
│  ├ supabase.ts          types.ts     auth.ts
│  ├ csv.ts               gemini.ts    scrape.ts
│  ├ queries.ts           mock.ts
├ data/
│  ├ companies_seed.csv   (246 社)
│  └ candidates_seed.json (4 名)
├ supabase/migrations/001_schema.sql
├ vercel.json
└ docs/README.md
```

## 開発フロー（推奨）

1. `npm run dev` でモックの 246 社を確認
2. Supabase プロジェクト作成 → `001_schema.sql` 流し込み
3. `.env.local` を埋めて `POST /api/import`
4. `POST /api/crawl?limit=5` でクロールを試打 → `POST /api/match?limit=10`
5. `/ready` で ◎ ○ が並ぶことを確認
6. Vercel に deploy → Cron が回り始める

## 既知の限界

- `recruit_page_url` が CSV にあるのは大手のみ。中堅以下は手で埋める
- `contact_paths` の流し込みはまだ未自動化（後追いで `POST /api/import` 拡張予定）
- 認証は CRON_SECRET 1 本だけ。社外公開する前に Supabase Auth に差し替える
