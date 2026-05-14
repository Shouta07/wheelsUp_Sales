# 面談FB システム Runbook

`wheelup-vercel/` の面談フィードバックシステムを 5人チームで運用するための手順書。

---

## 1. 投入前チェックリスト

### Supabase
- [ ] `supabase/schema.sql` を SQL Editor で適用
- [ ] `supabase/migration_001_leader_feedback.sql` を適用
- [ ] `supabase/migration_003_score_status.sql` を適用（採点ステータス + audit）
- [ ] Auth → Providers → Email → **Allow signups = OFF**
- [ ] Auth → URL Configuration → Site URL / Redirect URLs に本番 URL を登録
- [ ] Authentication → Users → 5 名分のアカウント作成（小林 / 西村 / 辻内 / 安藤 / 村上）

### Vercel 環境変数

| 変数 | open mode | team mode | 説明 |
|---|---|---|---|
| `AUTH_MODE` | `open` | (省略=team) | 認証モード |
| `SUPABASE_URL` | ✅ | ✅ | サーバ側 |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | ✅ | サーバ側のみ。漏らさない |
| `SUPABASE_ANON_KEY` | 不要 | ✅ | JWT 検証用（サーバ） |
| `VITE_SUPABASE_URL` | ✅ | ✅ | ブラウザ |
| `VITE_SUPABASE_ANON_KEY` | ✅ | ✅ | ブラウザ |
| `ALLOWED_EMAILS` | 不要 | ✅ | リストに無いメールは API・UI で 401 |
| `GEMINI_API_KEY` | ✅ | ✅ | Gemini 文字起こし・採点 |
| `GEMINI_MODEL` | 任意 | 任意 | デフォルト `gemini-2.0-flash` |
| `CRON_SECRET` | 不要 | ✅ | `openssl rand -base64 36` で 24 文字以上 |
| `KILL_LLM` | 緊急時 | 緊急時 | `true` で全 LLM ルートを 503 |
| `LLM_DAILY_RUN_LIMIT` | 任意 | 任意 | 日次上限 (UTC)。デフォルト 200 |

### 動作確認
- [ ] `/api/health` で `db: "ok"`, `config.*: "set"` が並ぶこと
- [ ] 5 名がログイン → MeetingHub から面談テキスト保存 → 採点バッジが「採点中」→「A 35/50」等に変わる
- [ ] わざと壊れた音声（極短いファイル）をアップロード → 採点失敗バッジ + 「再採点」ボタンが出る

---

## 2. API 認証モデル

3つのモードを `AUTH_MODE` 環境変数で切り替え：

| `AUTH_MODE` | 認証 | identity (created_by) | 使い所 |
|---|---|---|---|
| `team` (デフォルト) | Supabase JWT or Bearer `CRON_SECRET` | JWT の email | 外部公開・5名以上 |
| **`open`** | **なし** | **`X-User-Name` ヘッダ or `consultant_name` body** | **5名・社内URL専用（推奨）** |
| `mock` | なし（user=null） | null | ローカル開発・CI |

### `open` モードの挙動
- ブラウザは `wheelsup_current_user` (localStorage) の名前を `X-User-Name` で自動送信
- サーバはその名前を信用して `created_by` に書く（**証拠の改ざんは可能**——内部用URLの秘匿性が唯一の防壁）
- レート制限・cost guard・killswitch は引き続き有効
- `CRON_SECRET` / `ALLOWED_EMAILS` / `SUPABASE_ANON_KEY` は不要

### `team` モードの挙動
- ブラウザは `client.ts` の `request()` が自動で Supabase セッションの `access_token` を Bearer 付与
- マシン (curl / cron) は `CRON_SECRET` を Bearer に
- JWT は `supabase.auth.getUser(token)` で検証 → `email` を `ALLOWED_EMAILS` と照合
- 認証失敗時は常に 401。レスポンスヘッダに `X-Request-Id` を付与

---

## 3. 緊急停止 (Killswitch)

LLM コストの暴走や Gemini key 漏洩を察知したら：

1. Vercel → Project → Environment Variables → `KILL_LLM=true`
2. Redeploy
3. `/api/health` の `llm` が `"disabled"` になることを確認
4. `/api/meetings/transcribe|score|summarize|coach|extract-playbook` は 503 を返す

副次的に `LLM_DAILY_RUN_LIMIT`（デフォルト 200 / UTC日）でも自動キャップ。

---

## 4. シークレットローテーション

### `CRON_SECRET`
1. `openssl rand -base64 36`
2. Vercel 環境変数を更新 → redeploy
3. 古い値を使う外部スクリプトの参照先を更新

### `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_ANON_KEY`
1. Supabase → Settings → API → Regenerate
2. Vercel 環境変数を上書き → redeploy
3. 即座に失効するため、`/api/health` で `db: "ok"` を確認

### `GEMINI_API_KEY`
1. Google AI Studio で新 key 発行
2. Vercel に登録 → redeploy
3. 旧 key を削除

---

## 5. バックアップ & 復旧

`wheelsup-sales` メインアプリの `docs/RUNBOOK.md` §4-§5 と同様。
追加で `meeting_transcripts` のサイズが大きくなりがちなので、月 1 で容量を確認:

```sql
select pg_size_pretty(pg_total_relation_size('meeting_transcripts'));
```

---

## 6. 採点が失敗するときの調査

1. UI で「採点失敗 (gemini_5xx)」等のバッジを確認 → そのレコードに `score_error` カラムが入っている
2. Vercel Logs を `score_gemini_failed` で grep → `requestId` を取得
3. 同一 `requestId` の全ログを追って原因特定（Gemini レスポンス / タイムアウト / JSON パース）
4. 必要なら `KILL_LLM=true` で一時停止 → Gemini クォータや料金を確認
5. 解消したら UI で **再採点** ボタン or curl で:
   ```bash
   curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
        https://<host>/api/meetings/<uuid>/rescore
   ```

---

## 7. 監視

| 項目 | 監視先 | 閾値 |
|---|---|---|
| `/api/health` | uptime monitor | 連続 3 回 fail で alert |
| `score_status='failed'` 件数 | SQL: `select count(*) from meeting_transcripts where score_status='failed' and updated_at > now() - interval '1 day'` | 5 件/日で警告 |
| `auth_denied` ログ | Vercel Logs | 急増で警告 |
| Gemini 料金 | Google Cloud Billing | 日次予算超過 |
| meeting_transcripts 容量 | Supabase Storage | 400MB で警告 |

---

## 8. 既知の制限

- レート制限はインメモリ。Vercel が複数 lambda 並行起動すると各インスタンスが独立したバケットを持つ
- マジックリンク (Supabase OTP) の有効期限は 1 時間
- 音声アップロードは base64 後 10MB 上限（=元音声 ~7.5MB）。長尺は Supabase Storage 経由を別途実装すること
- 採点は 1 リクエスト内で最大 12 秒待機、超過時はバックグラウンドで継続（UI のポーリングが拾う）
