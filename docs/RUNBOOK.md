# Wheels Up Sales — 運用 Runbook

5人チーム運用を前提とした、本番運用で必要になる手順集。

---

## 1. 新メンバーの追加

1. Vercel の環境変数 `ALLOWED_EMAILS` に該当メールを追加（カンマ区切り）し、redeploy
2. 本人がアプリの `/login` ページでメールアドレスを入力 → マジックリンクをクリック
3. Supabase ダッシュボード（Auth → Users）に該当ユーザーが作成されたことを確認

> Supabase 側の「Allow signups」は **OFF にしておく**（Auth → Providers → Email）。`ALLOWED_EMAILS` から除外されたメールは、たとえメールを取得しても callback で拒否され `signOut` される。

## 2. メンバーの削除（退職など）

1. `ALLOWED_EMAILS` から削除 → redeploy（即座に新規ログイン不可）
2. Supabase Auth → Users で該当ユーザーを **Revoke session** または Delete
3. （任意）`activities` テーブルで `created_by = <email>` の履歴は保全のため残す

## 3a. インシデント時の緊急停止 (Killswitch)

LLM コストの暴走や Gemini key 漏洩を察知したら、**最初に LLM を止める**：

1. Vercel → Project Settings → Environment Variables → `KILL_LLM` を `true` に設定
2. Vercel → Deployments → 最新を **Redeploy**（30秒〜1分で反映）
3. 反映後、`/api/health` の `llm` フィールドが `"disabled"` になることを確認
4. `/api/crawl|match|discover` は HTTP 503 + `llm_disabled_by_killswitch` を返すようになる

副次的な日次キャップ（`LLM_DAILY_RUN_LIMIT`、デフォルト 200 runs/UTC日）は `crawl_runs` の件数で動く。上限到達後は次の 00:00 UTC まで HTTP 429。

復旧後は `KILL_LLM=` を空に戻して redeploy。

## 3. シークレットのローテーション

### `CRON_SECRET`
1. `openssl rand -base64 36` で新値を生成
2. Vercel 環境変数を更新 → redeploy
3. 古い値を使う外部スクリプト（cron、ETL等）の参照先を更新
4. Vercel ログで `auth_denied` が古い値で出ていないか 30 分監視

### `SUPABASE_SERVICE_ROLE_KEY`
1. Supabase ダッシュボード → Project Settings → API → **Regenerate** service_role
2. Vercel 環境変数を新値で上書き → redeploy
3. 古い key は即座に失効する。失効後の動作を Vercel ログで確認

### `GEMINI_API_KEY`
1. Google AI Studio で新 key を発行
2. Vercel に登録 → redeploy
3. 旧 key を削除

## 4. バックアップ

### Supabase の設定確認
- Pro plan 以上: **Daily backups（7 日保持）+ PITR（Point-in-Time Recovery）** を有効化
- Free plan: 手動バックアップ（推奨は週 1）

### 手動バックアップ（CLI）

```bash
# サービスロール key と DB URL を使って pg_dump
SUPABASE_DB_URL="postgresql://postgres:<db-password>@db.<project-ref>.supabase.co:5432/postgres"
pg_dump --no-owner --clean --if-exists \
  --schema=public \
  "$SUPABASE_DB_URL" \
  > backup_$(date +%Y%m%d).sql
```

バックアップファイルは S3 / Google Drive 等の社内ストレージに暗号化保存。

### 検証

月 1 で実施:
```bash
# 別の Supabase プロジェクト（staging）に restore してアプリを立てる
psql "$STAGING_DB_URL" < backup_YYYYMMDD.sql
```
ログイン → `/companies` が想定通り表示されることを確認。

## 5. 復旧（Disaster Recovery）

### ケース A: テーブルの誤更新（人為ミス）

1. Supabase Dashboard → Database → Backups → **Restore from PITR** で誤操作直前を指定
2. （PITR が無い場合）最新の `backup_YYYYMMDD.sql` を staging に restore → 該当行のみ本番に手動 INSERT/UPDATE

### ケース B: プロジェクト全体損失

1. 新規 Supabase プロジェクト作成
2. `001_schema.sql` → `002_rls.sql` → `003_team_access.sql` を順に流す
3. 最新の `backup_YYYYMMDD.sql` から `data` のみを restore（`--data-only`）
4. Vercel の `SUPABASE_URL` / `_SERVICE_ROLE_KEY` / `NEXT_PUBLIC_*` を新プロジェクトに切替
5. `/api/import` を 1 度実行してシード CSV を反映
6. 5 人のログイン疎通確認

## 6. 監視 & アラート（推奨）

| 項目 | 監視先 | 閾値 |
|------|--------|------|
| API 5xx 率 | Vercel Analytics / Logs | 5%/15分 |
| `auth_denied` 件数 | Vercel Logs (`grep auth_denied`) | 急増（10倍） |
| Supabase 接続数 | Supabase Dashboard | 上限の 70% |
| Gemini 料金 | Google Cloud Billing | 日次 ¥X 超過 |
| クロール失敗率 | `crawl_runs.stats.errors` | 全体の 20% |
| 日次 LLM run 数 | `crawl_runs` の本日件数 | `LLM_DAILY_RUN_LIMIT` の 80% で警告 |
| ヘルスチェック | `/api/health` の 200 応答 | 連続 3 回失敗で alert |

## 7. インシデント時の調査

すべての API レスポンスに `X-Request-Id: <id>` が付く。クライアントから「動かない」と言われたら:

1. ブラウザの DevTools → Network → 該当リクエストの Response Headers から `X-Request-Id` を取得
2. Vercel Logs で `requestId:<id>` を grep
3. `route` / `user` / `err` フィールドから原因特定

ログは全て JSON Lines。`route` / `user` / `ip` / `requestId` で絞り込み可能。

## 8. 既知の制限

- **レート制限はインメモリ**。Vercel が複数 lambda を並行起動すると、各インスタンスが独立したバケットを持つ。本気で守るなら Upstash KV へ
- **マジックリンクの有効期限は 1 時間**（Supabase デフォルト）。期限切れは `/login` で再送
- **管理者操作（ユーザー削除など）は Supabase Dashboard で直接**。アプリ側に admin UI は無い
