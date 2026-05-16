# Supabase セットアップ手順（wheelsUp Sales）

5人チーム運用版。ブラウザログインは廃止し、ユーザー選択画面で担当者を選ぶ方式。
サーバ側は service_role 鍵で DB を直接操作するため、Supabase Auth の設定は不要。

## 1. Supabase プロジェクト作成（無料・5分）

1. https://supabase.com にアクセス → Sign Up（GitHub連携推奨）
2. 「New Project」をクリック
3. 以下を入力:
   - **Organization**: 自分の組織名（初回は自動作成）
   - **Project name**: `wheelsup-sales`
   - **Database Password**: 安全なパスワードを設定（メモしておく）
   - **Region**: `Northeast Asia (Tokyo)` を選択
4. 「Create new project」→ 2分程度で作成完了

## 2. データベーステーブル作成（5分）

Supabase ダッシュボード → 左メニュー「SQL Editor」で、以下を**順番に**実行:

1. `supabase/schema.sql`（初回のみ。全テーブル作成）
2. `supabase/migration_001_leader_feedback.sql`（リーダーコメント欄）
3. `supabase/migration_002_ra_system.sql`（RA 開拓モード用）
4. `supabase/migration_003_playbook_cache.sql`（プレイブック生成のキャッシュ）

それぞれの内容を SQL Editor にコピー＆ペーストして「Run」。
全部 `create table if not exists` / `add column if not exists` で書いているため、何度実行しても安全。

### 既存プロジェクトの場合

すでに `meeting_transcripts` テーブルがある場合は、`migration_001` 以降だけ順番に実行すれば追従できる。

## 3. API キー取得（1分）

1. Supabase ダッシュボード → 「Settings」→ 「API」
2. 以下をメモ:
   - **Project URL**: `https://xxxxx.supabase.co`
   - **anon public key**: `eyJhbG...`（公開キー）
   - **service_role key**: `eyJhbG...`（秘密キー・Vercelのみ）

## 4. Gemini API キー取得（2分）

1. https://aistudio.google.com/apikey にアクセス
2. 「Create API key」→ 既存 GCP プロジェクトまたは新規を選択
3. 表示された `AIza...` のキーをメモ

文字起こし・採点・プレイブック生成・フェーズコーチングすべてが Gemini を使う。**必須**。

## 5. Vercel 環境変数設定（3分）

Vercel ダッシュボード → プロジェクト → 「Settings」→ 「Environment Variables」で以下を追加（Production と Preview の両方）:

| 変数名 | 値 | 用途 |
|--------|------|------|
| `VITE_SUPABASE_URL` | Supabase Project URL | ブラウザがデモモードに落ちないため |
| `VITE_SUPABASE_ANON_KEY` | anon public key | 同上 |
| `SUPABASE_URL` | Supabase Project URL | サーバAPI が DB に書き込むため |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role key | 同上（**絶対にフロントに露出させない**） |
| `GEMINI_API_KEY` | AIza... | 文字起こし・採点・プレイブック・コーチング全般 |

設定後、最新デプロイから「Redeploy」（環境変数はビルド時に注入される）。

## 6. リーダー / メンバー設定

メンバー一覧とリーダー判定は `src/lib/team.ts` で一元管理。
名前・色・アイコン・役割の追加変更はここだけ触ればフロント全体に反映される。

```ts
// src/lib/team.ts
export const TEAM_MEMBERS = [
  { name: "小林", role: "leader", color: "#FF9600", icon: "👑" },
  { name: "西村", role: "member", color: "#1CB0F6", icon: "💼" },
  // ...
];
```

`isLeader(name)` でリーダー判定。`getLeaderNames()` で名前リスト。

## 7. 動作確認

1. 本番 URL にアクセス → ユーザー選択画面でメンバーを選ぶ
2. `/api/health?reveal=1` を直叩きして `supabase: "ok"`, `gemini: "ok"` を確認
3. 面談を1件追加（音声 4MB 以下 or テキスト貼り付け）→ 自動採点完了
4. 別ブラウザでリーダーを選択 → 同じ面談にコメント入力 → 元のメンバー側に反映
5. PlaybookPanel で「プレイブック生成」→ ⚡キャッシュバッジが2回目以降に表示されれば OK

## アーキテクチャ

```
ブラウザ(React) ──→ Vercel Serverless API ──→ Supabase DB
                                            ──→ Gemini API (文字起こし・採点・プレイブック・コーチング)
```

- 認証なし。`UserSelectPage` で選んだ名前を `localStorage` に保存し、`consultant_name` として API に送る
- フロントは Supabase クライアントを参照していない（DEMO_MODE 検出のために URL の存在チェックだけ）
- サーバ API は service_role 鍵で DB を直接操作する（RLS は無効でよい）
- プレイブックは `meeting_playbook_cache` テーブルにキャッシュ。ソース面談が変わると自動的に無効化、`force: true` で強制再生成

## トラブルシュート

- **「⚠️ デモモード」バナーが出る** → `VITE_SUPABASE_URL` が未設定。Vercel の環境変数を確認して再デプロイ
- **採点が「採点中...」のまま止まる** → サーバの `GEMINI_API_KEY` が未設定か、レートリミット。`/api/health?reveal=1` で確認。または UI の「再採点」ボタンで手動再試行
- **音声アップロードで 413** → ファイルが 4MB 超。低ビットレート（32kbps 程度）に再エンコードするか、面談を区切って分割する
- **プレイブックが空で返る** → リーダー面談が登録されていないか、Gemini の出力が JSON にならなかった。リーダーで面談を1件以上記録してから再生成

## 無料枠の制限

| リソース | 無料枠 | 5人チームでの見積もり |
|---------|--------|---------------------|
| Supabase DB | 500MB | 面談500件以上は余裕 |
| Vercel Serverless | 月100GB-hours | 1日数十リクエスト程度なら余裕 |
| Gemini 2.0 Flash | 無料層あり | 採点1回 ≒ 1リクエスト。1日数十回までは無料 |
| Vercel リクエストボディ | 4.5MB | 音声 4MB 以下で運用 |
