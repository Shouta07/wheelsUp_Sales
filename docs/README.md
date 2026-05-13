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
- 認証:
  - **ブラウザ**: Supabase Auth マジックリンク。`ALLOWED_EMAILS` の allow-list が有効
  - **マシン (cron/curl)**: `Authorization: Bearer <CRON_SECRET>`（fallback: `?secret=`）
- レート制限: IP + ルート単位のインメモリ token bucket。LLM 系は 4 req/min、書込系は 20 req/min。
- 監査ログ: 全 API レスポンスに `X-Request-Id` を付与。サーバ側は JSON Lines で出力。

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

Supabase SQL Editor で以下を順に実行:

1. `supabase/migrations/001_schema.sql` — テーブル + ビュー
2. `supabase/migrations/002_rls.sql` — RLS（anon/authenticated を全テーブルから完全に締め出し、service_role 経由のみ許可）
3. `supabase/migrations/003_team_access.sql` — チーム運用向けにログイン済みユーザーへ SELECT を再付与、`activities` への INSERT も許可

> 単独運用なら 002 まででよい。**5人チーム運用** で UI からログインさせる場合は 003 まで流す。

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

| Method | Path | 認証 | 役割 |
| ------ | ---- | ---- | ---- |
| GET   | `/api/health`   | なし | uptime probe（mode/auth/llm を返す） |
| POST  | `/api/import`   | 必須 | `data/*` から companies/candidates を upsert |
| POST  | `/api/crawl`    | 必須 | `companies.recruit_page_url` を Jina Reader→Gemini で求人抽出 |
| POST  | `/api/match`    | 必須 | open な job × 4候補者を Gemini で ◎◯△× + 0..100 |
| POST  | `/api/discover` | 必須 | Gemini で類似企業を提案 → `discovery_queue` |
| POST  | `/api/activity` | 必須 | 送信/商談/採用などの活動ログを記録 |
| GET   | `/api/cron`     | 必須 | crawl + match を一括実行（Vercel Cron 22:00 UTC = 07:00 JST） |

LLM 系（crawl / match / discover）は **コストガード** 経由。`KILL_LLM=true` で即停止、`LLM_DAILY_RUN_LIMIT`（デフォルト 200 runs/UTC日）で日次キャップ。詳細は `docs/RUNBOOK.md` の §3a。

例（Bearer 推奨）:

```bash
H="Authorization: Bearer $CRON_SECRET"
curl -X POST -H "$H" "https://<host>/api/import"
curl -X POST -H "$H" "https://<host>/api/crawl?limit=20"
curl -X POST -H "$H" "https://<host>/api/match?limit=50"
curl -X POST -H "$H" "https://<host>/api/discover?count=20"
curl -X POST -H "$H" -H 'content-type: application/json' \
  -d '{"company_id":"...","match_id":"...","kind":"proposal_sent","channel":"email","body":"初回提案メール送信"}' \
  "https://<host>/api/activity"
```

`?secret=...` も互換性のため受け付けますが、URL に出るため Bearer を推奨。

### `CRON_SECRET` 要件（実行時に検証）
- `change-me` / `secret` / `password` などの既定値は **拒否**
- 24 文字以上が必須
- 生成例: `openssl rand -base64 36`

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

## テストと CI

```bash
npm test          # node:test ベースの単体テスト（pg / auth / ratelimit / csv）
npm run typecheck # tsc --noEmit
npm run build     # 本番ビルド（mock モードで通る）
```

`.github/workflows/ci.yml` で push/PR ごとに上記 3 つを実行します。

## 本番チェックリスト（5人チーム運用）

- [ ] `001_schema.sql` → `002_rls.sql` → `003_team_access.sql` を Supabase で順に適用
- [ ] `CRON_SECRET` を `openssl rand -base64 36` で生成、Vercel 環境変数に登録
- [ ] `SUPABASE_SERVICE_ROLE_KEY` がクライアントに漏れていないか確認（`NEXT_PUBLIC_*` には絶対に置かない）
- [ ] `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` を Vercel に登録（ブラウザ Auth 用）
- [ ] `ALLOWED_EMAILS=alice@co.jp,bob@co.jp,...` を Vercel に登録（5人分）
- [ ] Supabase Dashboard → Auth → Providers → Email → **Allow signups = OFF**
- [ ] Supabase Dashboard → Auth → URL Configuration → Site URL & Redirect URLs に本番URLを登録（`https://<host>/auth/callback`）
- [ ] `/api/import` を 1 度だけ手動実行（Bearer 認証で）
- [ ] Vercel Cron が `/api/cron` を 22:00 UTC に叩く設定を確認
- [ ] 5 人が `/login` でサインインできることを動作確認
- [ ] バックアップ設定の確認 → `docs/RUNBOOK.md` を参照
- [ ] `KILL_LLM` を緊急時に切り替えられる権限者を 2 名以上確保
- [ ] `LLM_DAILY_RUN_LIMIT` を運用予測に合わせて調整（デフォルト 200/日）
- [ ] Vercel / 外部 uptime monitor から `/api/health` を 5 分間隔で監視
- [ ] GitHub: Dependabot + CodeQL が動作することを最初の PR で確認

詳細な運用手順（メンバー追加・削除、鍵ローテーション、バックアップ、復旧、監視）は **[docs/RUNBOOK.md](./RUNBOOK.md)** を参照。

## noindex

- `next.config.ts` の `headers` で `X-Robots-Tag: noindex, nofollow` を全パス付与
- `app/layout.tsx` の `metadata.robots` でも HTML レベルで noindex
