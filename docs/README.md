# Wheels Up Sales — RA人材紹介の新規開拓自動化

Next.js 15 App Router + Supabase REST + Gemini 2.5 Flash Lite で動く社内ツール。
建築設備 / FM / PM / 施設管理領域の法人を対象に、求人クロール → LLM マッチ判定
→ 実行待ちリストへ流すワークフローを自動化する。

## スタック

- Next.js 15 (App Router) + React 19 + TypeScript strict
- Tailwind CSS
- Supabase（REST のみ、SDK 不要）
- Gemini 2.5 Flash Lite（`GEMINI_API_KEY`、`GEMINI_MODEL` で上書き可）
- Jina Reader（`JINA_API_KEY` があれば優先、なければ素のfetchにフォールバック）
- 認証: `CRON_SECRET` をクエリパラメータで渡す（後で Supabase Auth へ拡張予定）

## 初期セットアップ

```bash
npm install
cp .env.example .env.local   # 必要な値を埋める
```

### 環境変数

| 変数 | 必須 | 用途 |
| ---- | ---- | ---- |
| `SUPABASE_URL` | 本番のみ | 例: `https://xxxx.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | 本番のみ | サーバ側のみ。クライアントには出さない |
| `GEMINI_API_KEY` | 本番のみ | crawl/match/discover で使用 |
| `GEMINI_MODEL` | 任意 | デフォルト `gemini-2.5-flash-lite` |
| `JINA_API_KEY` | 任意 | あれば Reader を優先利用 |
| `CRON_SECRET` | 本番のみ | `?secret=...` で API を保護 |

環境変数を何も設定せずに `npm run dev` を立ち上げると **モックモード** で動く。
246社のシード CSV と4名の候補者 JSON が直接読まれ、`/companies` などが表示される。

## DB セットアップ（本番）

`supabase/migrations/001_schema.sql` を Supabase SQL Editor に貼って実行。

テーブル:

- `companies` — 開拓対象企業
- `jobs` — クロール抽出済みの求人（`content_hash` で差分検知）
- `candidates` — 候補者（4名: 志村 / 宮本 / 長島 / 加藤）
- `matches` — job × candidate の ◎◯△× 判定
- `activities` — 送信・商談・採用などの活動ログ
- `discovery_queue` — LLM が提案した新規開拓候補
- `crawl_runs` — 各バッチの実行ログ

ビュー:

- `company_overview` — 企業一覧の集計
- `ready_to_execute` — ◎◯ × まだ送っていない行

## API（すべて `?secret=CRON_SECRET` 必須）

| Method | Path | 役割 |
| ------ | ---- | ---- |
| POST | `/api/import` | `data/*` から companies/candidates を upsert |
| POST | `/api/crawl` | `companies.recruit_page_url` を Jina Reader→Gemini で求人抽出 |
| POST | `/api/match` | open な job × 4候補者を Gemini で ◎◯△× + 0..100 |
| POST | `/api/discover` | Gemini で類似企業を提案 → `discovery_queue` |
| POST | `/api/activity` | 送信/商談/採用などの活動ログを記録 |
| GET  | `/api/cron` | crawl + match を一括実行（Vercel Cron 22:00 UTC = 07:00 JST） |

例:

```bash
curl -X POST "https://<host>/api/import?secret=$CRON_SECRET"
curl -X POST "https://<host>/api/crawl?secret=$CRON_SECRET&limit=20"
curl -X POST "https://<host>/api/match?secret=$CRON_SECRET&limit=50"
curl -X POST "https://<host>/api/discover?secret=$CRON_SECRET&count=20"
curl -X POST "https://<host>/api/activity?secret=$CRON_SECRET" \
  -H 'content-type: application/json' \
  -d '{"company_id":"...","match_id":"...","kind":"proposal_sent","channel":"email","body":"初回提案メール送信"}'
```

## ダッシュボード

- `/` 概況サマリ + 実行待ち（直近20件）
- `/ready` ◎◯ × 未送信の全件。ボタン1つで `proposal_sent` を記録
- `/companies` 246社一覧（社名・カテゴリ・優先度で絞り込み）
- `/companies/[id]` 個社詳細（連絡経路・求人・◎○△×判定・活動履歴）
- `/discovery` 発掘キュー（LLM 提案、人手レビュー対象）

## 運用フロー

1. Vercel Cron が 22:00 UTC（= 07:00 JST）に `/api/cron` を叩く
2. crawl が `companies` 上位 20 社の採用ページを取得して `jobs` を更新
3. match が新規 job × 4 候補者を判定して `matches` を追加
4. `ready_to_execute` ビューに ◎◯ かつ未送信の行が現れる
5. 担当者が `/ready` で確認し、送信後にボタンで `activities.proposal_sent` を記録

## デプロイ（Vercel）

- 上記の環境変数を Vercel に登録
- `vercel.json` に `/api/cron` の毎日 22:00 UTC ジョブを定義済み
- 初回のみ `/api/import` を 1 度叩いてシードを投入する

## モックモードについて

`SUPABASE_URL` が未設定だと `lib/queries.ts` が自動で `data/*` を直接読む。
ローカル UI の動作確認・社内デモに便利。書込み系 API は 400 を返す。

## 候補者（4名）

`data/candidates_seed.json` に入っているのは:

- 志村（48・在職中・FM運用統括）
- 宮本（42・在職中・サブコン施工管理）
- 長島（36・離職中・PM）
- 加藤（53・来月退職予定・ビル管理所長）

`profile` には `specialties / industries_ok / license / salary_min_jpy / salary_max_jpy / in_progress / summary` を入れている。
プロフィールは差し替え自由で、match プロンプトに JSON のまま渡る。

## noindex

- `next.config.ts` の `headers` で `X-Robots-Tag: noindex, nofollow` を全パス付与
- `app/layout.tsx` の `metadata.robots` でも HTML レベルで noindex
