# Supabase セットアップ手順（wheelsUp Sales）

## 1. Supabase プロジェクト作成（無料・5分）

1. https://supabase.com にアクセス → Sign Up（GitHub連携推奨）
2. 「New Project」をクリック
3. 以下を入力:
   - **Organization**: 自分の組織名（初回は自動作成）
   - **Project name**: `wheelsup-sales`
   - **Database Password**: 安全なパスワードを設定（メモしておく）
   - **Region**: `Northeast Asia (Tokyo)` を選択
4. 「Create new project」→ 2分程度で作成完了

## 2. データベーステーブル作成（3分）

1. Supabase ダッシュボード → 左メニュー「SQL Editor」
2. `supabase/schema.sql` の内容をすべてコピー＆ペースト
3. 「Run」をクリック → 全テーブルが作成される

### 既存プロジェクトの場合（migration適用）
順番通りに SQL Editor で実行:

1. `supabase/migration_001_leader_feedback.sql` — リーダーFB列
2. `supabase/migration_002_ra_system.sql` — RA / Prospecting テーブル群
3. `supabase/migration_003_score_status.sql` — 採点ステータス + audit 列

> migration_003 を流さないと UI の「採点中…」/「再採点」バッジが動きません。本番運用には必須です。

## 3. 認証設定（チーム5人用・5分）

1. Supabase ダッシュボード → 「Authentication」→ 「Providers」
2. **Email** が有効になっていることを確認
3. 「Users」タブ → 「Add user」→ 「Create new user」で5人分作成:

| メール | パスワード | 表示名 |
|--------|-----------|--------|
| kobayashi@wheelsup.local | (任意) | 小林 |
| nishimura@wheelsup.local | (任意) | 西村 |
| tsuchiuchi@wheelsup.local | (任意) | 辻内 |
| ando@wheelsup.local | (任意) | 安藤 |
| murakami@wheelsup.local | (任意) | 村上 |

※ メールアドレスは実在しなくてOK（確認メール不要に設定可能）
※ Authentication → Settings → 「Confirm email」をOFFにすると確認不要

## 4. API キー取得（1分）

1. Supabase ダッシュボード → 「Settings」→ 「API」
2. 以下をメモ:
   - **Project URL**: `https://xxxxx.supabase.co`
   - **anon public key**: `eyJhbG...`（公開キー）
   - **service_role key**: `eyJhbG...`（秘密キー・Vercelのみ）

## 5. Vercel 環境変数設定（3分）

1. Vercel ダッシュボード → プロジェクト → 「Settings」→ 「Environment Variables」
2. 以下を追加:

| 変数名 | 値 | 環境 |
|--------|------|------|
| `VITE_SUPABASE_URL` | `https://xxxxx.supabase.co` | Production, Preview |
| `VITE_SUPABASE_ANON_KEY` | anon public key | Production, Preview |
| `SUPABASE_URL` | `https://xxxxx.supabase.co` | Production, Preview |
| `SUPABASE_ANON_KEY` | anon public key (JWT検証用) | Production, Preview |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role key | Production, Preview |
| `ALLOWED_EMAILS` | `kobayashi@...,nishimura@...,...` 5名 | Production, Preview |
| `GEMINI_API_KEY` | Gemini API キー | Production, Preview |
| `CRON_SECRET` | `openssl rand -base64 36` で 24 文字以上 | Production, Preview |
| `KILL_LLM` | 緊急時のみ `true` | Production |
| `LLM_DAILY_RUN_LIMIT` | 日次キャップ（デフォルト 200） | Production (任意) |

詳細な運用手順（killswitch、シークレットローテーション、採点失敗の調査、監視）は **[docs/MEETING_FB_RUNBOOK.md](../docs/MEETING_FB_RUNBOOK.md)** を参照。

3. 「Save」→ 「Redeploy」（最新デプロイを再デプロイ）

## 6. 動作確認

1. https://wheels-up-sales.vercel.app にアクセス
2. ユーザー選択で「西村」等を選ぶ
3. 面談を追加 → AI採点 → スコアが表示されればDB接続成功
4. 別のブラウザで「小林」でログイン → 西村の面談にコメント入力 → 保存
5. 西村側をリロード → 小林のコメントが表示されれば完了

## アーキテクチャ

```
ブラウザ(React) ──→ Vercel Serverless API ──→ Supabase DB
                                            ──→ Gemini API (文字起こし・AI要約)
```

- `VITE_SUPABASE_URL` が設定されると自動的にDEMO_MODEが解除
- 面談データはSupabase PostgreSQLに永続化
- スコアリングはサーバーサイドでGemini APIを使用
- フロントエンドはVercelから静的配信

## 無料枠の制限

| リソース | 無料枠 | 5人チームでの見積もり |
|---------|--------|---------------------|
| DB容量 | 500MB | 面談500件以上は余裕 |
| 認証 | 月5万MAU | 5人なら問題なし |
| API呼び出し | 制限なし | - |
| ファイルストレージ | 1GB | 音声ファイル保存用 |
