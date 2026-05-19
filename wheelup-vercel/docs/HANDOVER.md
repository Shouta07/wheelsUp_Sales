# WheelsUp Sales 引き継ぎ資料

> 2026-05 時点の本番稼働システム全体像。
> 対象読者: 先方の開発担当者 / 運用担当者。
> このドキュメント 1 本でシステム全容・運用・移管項目が把握できることを目的とする。

---

## 0. ひとことサマリ

5 人規模の建築技術者専門エージェンシー向け SaaS。
**面談 FB システム** (商談コーチング) と **RA 開拓システム** (新規企業発掘) の 2 モジュールを 1 つの Vercel プロジェクトに同居。
ヘッダー左上のトグルで切替。データは Supabase に集約、AI は Google Gemini を使用。

| モード | URL | 主用途 | 主ユーザー |
|---|---|---|---|
| 面談FB | `/` | 面談議事録の AI 採点 + 成長可視化 | 小林 (リーダー) + メンバー 4 名 |
| RA開拓 | `/ra` | 求人クロール + 候補者マッチング | RA 担当 (リーダー中心) |

---

## 1. システム全体図

```
                  ┌──────────────────────┐
                  │  ユーザー (ブラウザ)   │
                  └──────────┬───────────┘
                             │ HTTPS
                  ┌──────────▼───────────┐
                  │  Vercel              │
                  │  - React + Vite SPA  │
                  │  - Serverless API    │
                  └─┬────────────┬───────┘
                    │            │
        ┌───────────▼─┐     ┌────▼──────────────┐
        │  Supabase   │     │  Google Gemini    │
        │  Postgres   │     │  2.5-flash 系     │
        │  + RLS      │     │  多段フォールバック │
        └─────────────┘     └───────────────────┘
                    ▲
                    │ Cron (07:00 JST)
        ┌───────────┴───────────┐
        │  Vercel Cron Jobs     │
        │  /api/ra/cron         │
        │  (crawl + match 自動) │
        └───────────────────────┘
```

### 技術スタック

| 層 | 技術 |
|---|---|
| フロント | React 18 + Vite + TypeScript + TailwindCSS |
| API | Vercel Serverless Functions (Node.js 24.x) |
| DB | Supabase PostgreSQL (Row Level Security 有効) |
| AI | Google Gemini API (`gemini-2.5-flash` 系) |
| 認可 | ヘッダーベース (`X-User-Name`) + CRON_SECRET |
| デプロイ | Vercel (push to `main` で自動) |
| クローラ | Jina Reader (任意) + Node fetch fallback |

---

## 2. ディレクトリ構成 (主要部分)

```
wheelup-vercel/
├── api/                           # Vercel Serverless Functions
│   ├── meetings/index.ts          # 面談FB の全 API (~1400 行)
│   ├── ra/index.ts                # RA 開拓 の全 API (~1000 行)
│   ├── _data/                     # シードデータ
│   │   ├── leader-meetings-seed.json  # 小林の議事録 15 件 (教師データ)
│   │   ├── companies_seed.csv         # 開拓対象 246 社
│   │   └── candidates_seed.json       # 候補者 4 名
│   └── _lib/
│       ├── auth.ts                # ユーザー判定・役割判定
│       ├── rate-limit.ts          # in-memory bucket (6 req/min/user)
│       ├── supabase-admin.ts      # サーバー側 Supabase クライアント
│       ├── learning-resources.ts  # 軸ごとの学習リソース URL (固定)
│       ├── ra-gemini.ts           # RA 用 Gemini wrapper
│       ├── ra-scrape.ts           # ページ fetch + ハッシュ
│       ├── ra-csv.ts              # CSV パース
│       └── ra-search.ts           # Google Search 連携 (任意)
├── src/
│   ├── api/client.ts              # フロント側 API クライアント
│   ├── pages/
│   │   ├── Home.tsx               # 面談FB トップ
│   │   └── ra/                    # RA 開拓画面群
│   │       ├── ProspectingApp.tsx       # 4 タブのコンテナ
│   │       ├── ProspectingHome.tsx      # ダッシュボード (ファネル可視化)
│   │       ├── ProspectingJobs.tsx      # 募集ポジション一覧
│   │       ├── ProspectingCandidates.tsx# 候補者一覧
│   │       ├── ProspectingDiscovery.tsx # 新規発掘キュー
│   │       ├── ProspectingCompanyDetail.tsx
│   │       └── ...
│   ├── components/gamification/   # 採点・ダッシュボード系
│   │   ├── MeetingHub.tsx         # 面談カード一覧 + 採点 UI (~900 行)
│   │   ├── SkillRadar.tsx         # 自分 vs リーダー平均
│   │   ├── GrowthChart.tsx        # 5 軸スコア時系列折れ線
│   │   ├── CVRDashboard.tsx       # スコア × CVR 相関 (リーダー専用)
│   │   ├── PlaybookPanel.tsx      # 場面別「リーダーならこう話す」
│   │   ├── TodayMission.tsx       # 「今日何をすべきか」
│   │   ├── WeeklyChallenge.tsx
│   │   ├── WeeklyReport.tsx
│   │   ├── TeamHighlights.tsx
│   │   └── ...
│   ├── gamification/
│   │   └── GamificationProvider.tsx # 現在ユーザーの React Context
│   └── lib/
│       └── team.ts                # メンバー一覧 / isLeader 判定 (唯一の真実)
└── supabase/
    ├── schema.sql
    ├── migration_001_leader_feedback.sql
    ├── migration_002_ra_system.sql       # RA 関連テーブル一式
    ├── migration_003_playbook_cache.sql
    ├── migration_004_score_cache.sql
    ├── migration_005_hardening.sql       # RLS 厳格化
    ├── migration_006_outcome_history.sql # 論理削除 + 採点履歴 + アウトカム
    ├── migration_007_ra_anon_read.sql
    └── migration_008_ra_perf_indexes.sql
```

---

# 第 1 部: 面談 FB システム

## 3.1 何を解決するか

| 課題 | 解決方法 |
|---|---|
| リーダーが同席しないと質の高い面談ができない | 過去のリーダー面談を教師データに、AI がメンバーの面談を採点 |
| 「あの面談よかったね」だけでは何が良いか伝わらない | 5 軸 × 10 点 + 議事録からの根拠引用 + 改善コメント |
| 採点だけでは次に何を変えればいいか分からない | 「リーダーならこの場面でこう話す」を具体的セリフ付きで生成 |
| メンバーの伸びが見えない | 5 軸スコアを時系列で可視化、リーダー平均との差分も表示 |
| スコアと実際の成果 (CVR) が紐付かない | アウトカム (次回予約 / 応募 / 採用) を記録、スコア × CVR の相関ダッシュボード |

## 3.2 採点 5 軸

| 軸 | キー | 何を見るか |
|---|---|---|
| ニーズ深掘り | `needs` | 候補者の本音・課題を引き出せたか |
| 提案力 | `proposal` | 具体的な求人を「なぜマッチするか」付きで提示できたか |
| 信頼構築 | `trust` | 業界知識を示し、専門家として認められたか |
| 前進 (旧クロージング) | `closing` | 次のアクションを期限付きで握れたか |
| 情報収集 | `intel` | 他社状況・温度感・決裁者情報を聞き出せたか |

スコア構造:
```typescript
{
  scores: { needs: 1-10, proposal: 1-10, trust: 1-10, closing: 1-10, intel: 1-10 },
  evidence: { needs: ["..."], ... },      // 議事録からの引用 (根拠)
  improvements: { needs: ["..."], ... },  // 改善提案
  key_moments: ["..."]                    // 印象的な瞬間 (時刻付き)
}
```

## 3.3 主要画面 (Home.tsx)

```
┌─────────────────────────────────────────────────┐
│ [小林さん]              [面談FB ⇄ RA開拓]      │
├─────────────────────────────────────────────────┤
│ 🎯 今日のミッション (TodayMission)              │
├─────────────────────────────────────────────────┤
│ 📈 あなたの成長推移 (GrowthChart, 2件以上で表示)│
├─────────────────────────────────────────────────┤
│ 📊 CVR ダッシュボード (CVRDashboard, リーダー専用)│
├─────────────────────────────────────────────────┤
│ ──── MAIN ────                                   │
│ 📋 面談ライブラリ (MeetingHub)                   │
│   - 面談カード一覧                               │
│   - 議事録入力フォーム                           │
│   - AI 採点 / 手動採点                           │
│   - アウトカム記録                               │
│ 📖 リーダープレイブック (PlaybookPanel)         │
├─────────────────────────────────────────────────┤
│ 📊 統計・成長グラフ・チームハイライト [▼]     │
│   折りたたみ式:                                  │
│   - NotificationFeed (通知)                      │
│   - SkillRadar (5軸レーダー)                    │
│   - WeeklyChallenge (週次お題)                  │
│   - WeeklyReport (週次レポート)                 │
│   - TeamHighlights (チーム伸び)                 │
└─────────────────────────────────────────────────┘
```

## 3.4 API エンドポイント (`/api/meetings/*`)

| Method | Path | 役割 |
|---|---|---|
| POST | `/api/meetings` | 議事録テキスト保存 |
| POST | `/api/meetings/transcribe` | Gemini で base64 音声を文字起こし |
| GET | `/api/meetings` | 議事録一覧 (フィルタ: 日付 / 担当者) |
| GET | `/api/meetings/:id` | 議事録詳細 |
| PUT | `/api/meetings/:id` | 議事録更新 |
| DELETE | `/api/meetings/:id` | **論理削除** (`deleted_at` をセット) |
| POST | `/api/meetings/:id/score` | AI 採点実行 |
| POST | `/api/meetings/:id/summarize` | 要約生成 |
| POST | `/api/meetings/:id/leader-feedback` | リーダーが手動 FB 追加 |
| POST | `/api/meetings/extract-playbook` | リーダー面談からプレイブック抽出 |
| POST | `/api/meetings/coach` | 案件文脈付きフェーズ別コーチング |
| POST | `/api/meetings/:id/manual-score` | 手動採点登録 |
| POST | `/api/meetings/:id/outcome` | アウトカム記録 (次回予約 / 応募 / 採用) |
| GET | `/api/meetings/:id/history` | 採点履歴取得 |

## 3.5 データモデル (面談 FB)

### `meetings` テーブル
| カラム | 型 | 用途 |
|---|---|---|
| `id` | uuid | PK |
| `recorded_at` | timestamptz | 面談日時 |
| `consultant_name` | text | 担当 CA |
| `transcript` | text | 議事録本文 |
| `is_leader` | bool | リーダー教師データか |
| `score_data` | jsonb | AI 採点結果 (上記スコア構造) |
| `manual_score` | jsonb | 手動採点 |
| `outcome` | jsonb | `{next_meeting, applied, hired, recorded_at}` |
| `deleted_at` | timestamptz | 論理削除 (NULL = 生きてる) |
| `score_cache_key` | text | キャッシュ判定用ハッシュ |

### `score_history` テーブル
採点のスナップショット履歴。誤って上書きしてもロールバック可能。

| カラム | 型 |
|---|---|
| `id` | uuid |
| `meeting_id` | uuid (FK) |
| `score_data` | jsonb |
| `scored_at` | timestamptz |
| `scored_by` | text (`ai` / `manual` / `rescore`) |

## 3.6 AI 採点エンジンの設計

### モデル選定 (多段フォールバック)
```
gemini-2.5-flash      ← 優先 (品質)
   ↓ quota / error
gemini-2.0-flash      ← フォールバック
   ↓
gemini-2.5-flash-lite ← 最終 (軽量・無料枠広い)
```
1 アカウントで quota:0 が出る事象に対応するため。

### コスト最適化
- **キャッシュキー** = リーダー教師データの `[id, updated_at]` 配列ハッシュ + 議事録本文ハッシュ
- 教師データが更新された時のみキャッシュ無効化
- 同じ議事録に対する再採点は 2 回目以降ほぼ無料

### セキュリティ
- **プロンプトインジェクション対策**: 議事録は `<transcript>...</transcript>` XML タグでラップし、システム指示と分離
- **Rate Limit**: 1 ユーザー 6 req/分 (in-memory bucket)
- **教師データアクセス制御**: 小林のみがリーダー面談に書き込み可

---

# 第 2 部: RA 開拓システム

## 4.1 何を解決するか

| 課題 | 解決方法 |
|---|---|
| 246 社の求人ページを手で巡回するのが非現実的 | 毎朝 7 時に自動クロール、差分検知 |
| どの求人が誰に合うかを毎回考えるのが大変 | 候補者プロフィール × 求人を Gemini で自動採点 (◎○△×) |
| 新規ターゲット企業の発掘が止まる | LLM が業界・規模条件から新候補をサジェスト |
| 進捗が見えない | ファネル可視化: 企業 → URL補完 → 求人公開 → ◎○マッチ → 送信可能 |

## 4.2 主要画面 (`/ra` - 4 タブ構成)

```
┌─────────────────────────────────────────────────┐
│ [RA 新規開拓]                          [LIVE]  │
├─────────────────────────────────────────────────┤
│ 🏠ホーム  📋募集ポジション  👥候補者  🔍新規発掘 │
├─────────────────────────────────────────────────┤
│ <選択タブの内容>                                │
└─────────────────────────────────────────────────┘
```

### タブ別役割

| タブ | コンポーネント | 内容 |
|---|---|---|
| 🏠 ホーム | ProspectingHome | KPI ファネル + 今日のアタックリスト + 企業一覧 (検索) |
| 📋 募集ポジション | ProspectingJobs | クロール済み求人一覧、候補者マッチ判定済み |
| 👥 候補者一覧 | ProspectingCandidates | 4 候補者のプロフィール + 各人のマッチ求人 |
| 🔍 新規発掘 | ProspectingDiscovery | LLM 提案の新規候補企業 (人手レビュー対象) |

### 企業詳細画面
企業名クリックで遷移。
- 連絡経路 (電話 / メール / フォーム)
- 公開求人一覧
- 候補者マッチ判定
- 活動履歴 (送信 / 商談 / クローズ)

## 4.3 API エンドポイント (`/api/ra/*`)

すべて `?secret=$CRON_SECRET` または Supabase JWT 必須。

| Method | Path | 役割 |
|---|---|---|
| POST | `/api/ra/import` | seed CSV/JSON を Supabase へ upsert |
| POST | `/api/ra/enrich` | URL 未設定の会社を Gemini で一括補完 |
| POST | `/api/ra/crawl` | 求人ページを fetch → Gemini で構造化 → upsert |
| POST | `/api/ra/match` | open job × candidate → Gemini 採点 → `ra_matches` |
| POST | `/api/ra/discover` | Gemini で新規候補企業をサジェスト |
| POST | `/api/ra/activity` | 活動ログ追加 (`sent` / `meeting` / `closed`) |
| POST | `/api/ra/find-recruit-url` | 企業名から採用ページ URL を推測 |
| POST | `/api/ra/approve-discovery` | 発掘キューを `ra_companies` に昇格 |
| POST | `/api/ra/update-company` | 企業情報パッチ |
| POST | `/api/ra/update-candidate` | 候補者プロフィールパッチ |
| GET/POST | `/api/ra/cron` | crawl + match + Lark 通知 (Vercel Cron が叩く) |

### Cron 設定 (`vercel.json`)
毎日 22:00 UTC = 07:00 JST に `/api/ra/cron` を実行。

## 4.4 データモデル (RA)

全テーブル `ra_` プレフィックス (既存 `companies` / `candidates` / `jobs` と衝突回避)。

| テーブル | 役割 |
|---|---|
| `ra_companies` | ターゲット企業 246 社 |
| `ra_jobs` | クロール求人 (`content_hash` で差分検知) |
| `ra_candidates` | 4 候補者 (志村 / 宮本 / 長島 / 加藤) |
| `ra_matches` | job × candidate の LLM 採点 (◎○△× + 0-100 点) |
| `ra_activities` | 送信 / 商談 / クローズ 等の活動ログ |
| `ra_discovery_queue` | LLM が提案した新規候補企業 |
| `ra_crawl_runs` | crawl/match/discover/cron の実行ログ |
| `ra_app_state` | カーソル・フィーチャーフラグなどの汎用 KV |

### ビュー
- `ra_company_overview`: 一覧用集計 (open_jobs / strong_matches / last_activity_at)
- `ra_ready_to_execute`: ◎○ かつ未送信 → 「送信可能」画面の正本

### モックモード
`VITE_SUPABASE_URL` 未設定時はブラウザが `public/ra/companies_seed.csv` を直接 fetch。
ヘッダー右上の `LIVE` / `MOCK` バッジで現在のモードを表示。

---

# 第 3 部: 共通項目

## 5. 認可モデル

簡易ヘッダーベース。フロントが `X-User-Name: 小林` をエンコードして送信、API 側が判定。

| 役割 | 判定 (`team.ts`) | 権限 |
|---|---|---|
| リーダー | 小林 (`isLeader`) | 全員の面談閲覧、CVR ダッシュボード、教師データ更新、RA 全機能 |
| メンバー | 西村 / 辻内 / 安藤 / 村上 | 自分の面談のみ閲覧・採点、リーダー議事録は読み取りのみ |

⚠️ 本番運用拡大時は **Supabase Auth (メール/SSO) への移行を推奨**。現状は社内利用前提の簡易実装。

メンバー追加・変更は **2 箇所更新**:
- `src/lib/team.ts`
- `api/_lib/auth.ts`

## 6. 環境変数 (Vercel に設定)

| キー | 用途 |
|---|---|
| `SUPABASE_URL` | Supabase プロジェクト URL |
| `SUPABASE_SERVICE_ROLE_KEY` | サーバー側 (RLS バイパス) |
| `SUPABASE_ANON_KEY` | フロント側 |
| `VITE_SUPABASE_URL` | フロントビルド時に埋め込み |
| `VITE_SUPABASE_ANON_KEY` | フロントビルド時に埋め込み |
| `GEMINI_API_KEY` | Google Gemini API |
| `GEMINI_MODEL` | デフォルト `gemini-2.5-flash` (任意上書き) |
| `CRON_SECRET` | RA Cron / 内部 API の共有秘密 |
| `JINA_API_KEY` | (任意) ページクロール用。なければ素の fetch |
| `LARK_WEBHOOK_URL` | (任意) Lark への結果通知 |

## 7. データ保護方針

| リスク | 対策 |
|---|---|
| 誤削除 | 物理削除なし。`deleted_at` で論理削除のみ |
| 採点上書き | `score_history` テーブルに毎回スナップショット |
| プロンプトインジェクション | 議事録は XML タグでラップ、システム指示と分離 |
| API キー漏洩 | フロントには `ANON_KEY` のみ。`SERVICE_ROLE_KEY` はサーバー側専用 |
| スパム / 濫用 | 1 ユーザー 6 req/分の rate limit |
| Cron 不正発火 | `CRON_SECRET` 必須 |

## 8. デプロイ・運用フロー

### 現在の構成

```
ローカル開発 (Shouta07)
    │ git push
    ▼
Shouta07/wheelsUp_Sales (GitHub, 個人開発資産)
    │ 手動 pull → push
    ▼
Wheelsup-yokohama/SalesEnablement_RAsystem (GitHub, 本番)
    │ webhook
    ▼
Vercel (デプロイ → 本番 URL)
```

### 通常開発フロー (移管完了後の想定)

```
先方開発者がローカルで開発
    │ git push origin main
    ▼
Wheelsup-yokohama/SalesEnablement_RAsystem
    │ webhook
    ▼
Vercel 自動デプロイ (2-3 分)
```

## 9. コスト構造

| サービス | プラン | 月額目安 | 備考 |
|---|---|---|---|
| Vercel | Hobby → **Pro** | $0 → $20 | 複数人開発するなら Pro 必須 |
| Supabase | Free | $0 | 500MB DB / 2GB 転送内で運用中 |
| Gemini API | Free tier | $0 | 1 日 1500 req まで。多段フォールバックで吸収 |
| GitHub | Free | $0 | Private リポジトリ無制限 |
| Jina Reader | 任意 | $0 〜 | なくても fallback で動作 |
| **合計** | | **$0 〜 $20** | 5 ユーザー / 週 5 面談ペースで Free tier 内 |

## 10. 移管が必要な所有物 (現状 → 推奨先)

| 項目 | 現在の所有 | 推奨移管先 | 緊急度 |
|---|---|---|---|
| GitHub (本番) | Wheelsup-yokohama org | そのまま | ✅ |
| GitHub (個人資産) | Shouta07 | Shouta07 維持 | ✅ |
| Vercel プロジェクト | 個人 (Hobby) | 先方 Vercel アカウント (Pro) | ⚠️ 高 |
| Supabase プロジェクト | 翔太個人 | 先方 Supabase アカウント | ⚠️ 高 |
| Gemini API キー | 翔太個人 | 先方が Google AI Studio で発行 | ⚠️ 高 |
| ドメイン | `*.vercel.app` | カスタムドメイン推奨 | 任意 |

### Vercel Hobby プランの制約 (現在ブロック中)
> The Hobby Plan does not support collaboration for private repositories.

**解決策** (いずれか):
1. **Pro にアップグレード** ($20/月) — 根本解決、複数人開発OK
2. **コミット作者を Vercel オーナーに統一** — 履歴書き換え + force-push
3. **リポジトリを Public 化** — 非推奨 (ソース公開)

## 11. 緊急時の対応

| 事象 | 対応 |
|---|---|
| Vercel デプロイ失敗 | Vercel ダッシュボード → Deployments → 最新ビルドのログ確認 |
| AI 採点エラー (Gemini quota) | 自動でフォールバックモデルに切替。それでもダメなら手動採点で代替 |
| データ消失の不安 | `score_history` から復元可能。`meetings` は `deleted_at` 設定のみ (物理削除なし) |
| ユーザーから「採点遅い」 | Vercel Functions のコールドスタート (初回 2-3 秒) は仕様 |
| RA Cron が動かない | `vercel.json` の `crons` 設定 + `CRON_SECRET` 整合を確認 |
| 採点結果がおかしい | `score_history` で前回値を確認、教師データ (`leader-meetings-seed.json`) を再投入 |

## 12. 今後の TODO

### 短期 (引き継ぎ直後)
- [ ] Vercel Hobby 制限の解消 (Pro 化推奨)
- [ ] Supabase オーナー移管 (現状は翔太個人アカウント)
- [ ] Gemini API キーを先方発行のものに差し替え
- [ ] 本番 URL を先方ドメインにマッピング (任意)

### 中期
- [ ] Supabase Auth 導入 (現状ヘッダーベースの簡易認可)
- [ ] MeetingHub の採点表示レイアウト改善 (タブ or アコーディオン化)
- [ ] アウトカム入力の習慣化 UI 改善 (CVR ダッシュボードが活きるため)
- [ ] カスタムドメイン設定

### 長期
- [ ] スマホ録音 → 自動文字起こし連携 (現状は事前テキスト化前提)
- [ ] 他支社展開時のチーム間ベンチマーク
- [ ] RA 開拓と面談 FB のデータ連携 (送信先企業の面談スコアを紐付け等)

---

## 13. 関連ドキュメント

| ファイル | 内容 |
|---|---|
| `wheelup-vercel/docs/feature-purpose.md` | 機能ごとの目的・背景・解決する課題 |
| `wheelup-vercel/docs/ra-prospecting.md` | RA 開拓モジュールの詳細セットアップ手順 |
| `wheelup-vercel/supabase/SETUP.md` | Supabase 初期セットアップ |
| `docs/README.md` | 旧 Next.js 版 (現在は wheelup-vercel/ に統合済み) |

---

**作成**: 2026-05-19
**最終更新**: 2026-05-19
**作成者**: Claude (Shouta07 開発支援)
