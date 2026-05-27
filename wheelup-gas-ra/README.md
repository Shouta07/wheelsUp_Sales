# Wheels Up RA — Google Apps Script 版

Vercel + Supabase 版と同じ思想を Google Spreadsheet + GAS だけで実現する単体実装。
**¥0、Google アカウントだけで完結、RA が Sheets を触る感覚で使える**。

## 提供する機能

- セットした 246 社の採用ページを **AI が毎晩自動巡回**
- 採用 URL / お問い合わせフォーム URL / コーポレート URL / メール / LinkedIn を **AI が一発推定 → HEAD で実在確認**
- 開いてる求人を抽出して、セットした候補者と **◎○△× 採点**
- ◎○ × 未送信 だけ「**実行待ち**」シートに並ぶ
- チェックボックスを ☑ すると **活動ログに記録 + Gmail に下書きを作成** (本人 Gmail から送れる)
- 30 日更新されてない求人は **自動でクローズ**
- Gemini が **新規企業を月数十社提案** (発掘キュー)

人がやるのは **企業の追加 / 文章の最終チェック / 送信ボタン押下** だけ。

## ファイル構成

```
wheelup-gas-ra/
├ Main.gs           — Gemini / fetch / sheet I/O / runEnrich/Crawl/Match/Discover
├ Triggers.gs       — dailyCron + onEdit + bulkProcess
├ Bootstrap.gs      — ensureSheets + 候補者シード + CSV取込
├ Menu.gs           — onOpen でカスタムメニュー
├ CompaniesSeed.gs  — 246 社の内蔵シード (コピペ不要でワンクリック投入)
└ data/
   ├ companies_seed.csv     (246 社、参考 / 手動取込用)
   └ candidates_seed.json   (4 候補者、参考)
```

## セットアップ手順 (15 分)

### 1. Spreadsheet を作る (1 分)

[Google Drive](https://drive.google.com) → 新規 → Google スプレッドシート
ファイル名: `Wheels Up RA` 等

### 2. Apps Script に 4 ファイルを貼り付ける (3 分)

開いた Spreadsheet で **拡張機能 → Apps Script**。エディタが開く。

左ペイン「ファイル」の `+` から、5 つのファイルを作成:
- `Main.gs` ← このリポジトリの `Main.gs` を全部コピペ
- `Triggers.gs` ← 同じく
- `Bootstrap.gs` ← 同じく
- `Menu.gs` ← 同じく
- `CompaniesSeed.gs` ← 同じく (246 社の内蔵データ)

(自動で生成された `Code.gs` は削除しても OK)

**保存** (Cmd/Ctrl+S)。

### 3. API キーを設定 (2 分)

Apps Script の左メニュー **歯車アイコン (プロジェクトの設定)** → **スクリプト プロパティ** → **スクリプト プロパティを追加**:

| プロパティ | 値 |
| --- | --- |
| `GEMINI_API_KEY` | [AI Studio](https://aistudio.google.com/app/apikey) で発行したキー (必須) |
| `JINA_API_KEY` | [jina.ai](https://jina.ai/) で無料登録、スクレイピング品質向上 (任意) |
| `GOOGLE_SEARCH_API_KEY` | Google Cloud Console で **Custom Search JSON API** 有効化 → 認証情報からキー発行 (任意・推奨) |
| `GOOGLE_SEARCH_CX` | [Programmable Search Engine](https://programmablesearchengine.google.com/) で「ウェブ全体を検索」エンジン作成 → 検索エンジン ID (任意・推奨) |

**`GOOGLE_SEARCH_*` を設定すると URL 自動補完の的中率が 60%→90%+ に上がります** (無料 100 req/日)。
中堅以下の企業まで網羅したいなら設定推奨。設定しなければ自動で 2 段階 Gemini + パターン総当たりにフォールバックします。

### 4. タイムゾーンを Asia/Tokyo に (30 秒)

Apps Script の **プロジェクトの設定** → **タイムゾーン** を `Asia/Tokyo` (Japan Standard Time) に変更 → 保存。
(これしないと cron が 7am JST にならない)

### 5. 初回セットアップを実行 (1 分)

Spreadsheet 側に戻る → ページをリロード → 上のメニューに **🤖 RA** が出る → **📥 初回セットアップ** をクリック。

→ 7 タブが作成され、4 候補者が「候補者」タブに入る。

### 6. 246 社を投入 (10 秒)

メニュー **🤖 RA → 📥 企業マスタ 246社 投入 (内蔵・推奨)** をクリックするだけ。

→ `CompaniesSeed.gs` に内蔵された 246 社が「企業マスタ」タブに入る。

> CSV を手で貼り付ける必要はありません (20KB の貼り付けは GAS のダイアログ制約で
> 失敗しやすいため、内蔵データからの投入を推奨)。
> 自分で編集した CSV を使いたい場合のみ「📥 企業マスタ CSV 取り込み (手動貼付)」を利用。

### 7. トリガーを設定 (30 秒)

メニュー **🤖 RA → ⏰ トリガー設定** → 権限ダイアログが出るので、自分の Google アカウントで承認。

→ 毎朝 7:00 (Asia/Tokyo) に `dailyCron` 自動実行 + 「実行待ち」シートの ☑ チェックで `onEdit` 起動。

### 8. 初回データ投入 (246 社を埋める)

**おすすめ: 🚀 初回一括処理 を数回押すだけ**

メニュー **🤖 RA → 🚀 初回一括処理 (5分・繰り返し推奨)** をクリック。
1 回で「URL補完 → クロール → 候補者マッチ」を最大 5 分ぶん自動で進めます
(GAS の 6 分制限を超えないよう、各ステージが時間で自動的に打ち切られます)。

> 246 社を全部埋めるには、コーヒーを飲みながら **5〜6 回** 繰り返し押してください。
> 各クリックが約 5 分ぶん前進し、`recruit_page_url` が空の会社が減っていきます。
> 「企業マスタ」タブの `recruit_page_url` 列がほぼ埋まり、「実行待ち」タブに
> ◎○ が並べば完了です 🎉

個別に動かしたい場合は従来どおり以下も使えます:
- **🤖 URL 自動補完 (10 社)**
- **🕸 求人クロール (15 社)**
- **🎯 候補者マッチ (15 求人)**

完了。翌朝 7 時から cron が自動で回り、新着求人・再マッチを差分で追記します。

> **時間予算の仕組み**: dailyCron も初回一括処理も、各ステージに絶対締切
> (enrich 2分 / crawl 4分 / match 5分20秒 など) を設定しています。
> 重い処理でも 6 分制限で強制終了されず、途中まで安全に進めて次回続行します。

## 朝の運用 (5-10 分)

```
1. Spreadsheet を開く → 「実行待ち」タブ
2. ◎ の行を上から確認:
     企業名 / 求人タイトル / 候補者 / 理由 / contact_form_url / contact_email
3. contact_email がある場合:
   a. ☑ にチェック → onEdit が発火
   b. Gmail の「下書き」に件名+本文が作成される
   c. Gmail で開いて本文を編集 → 送信
4. contact_form_url しかない場合:
   a. URL をクリック → 別タブでフォームが開く
   b. 自分で送信
   c. 戻って ☑ にチェック → 活動ログに記録される (Gmail 下書きは作成されない)
5. 「活動ログ」タブで送信履歴を確認可能
```

ポイント: **チェックを入れた瞬間に活動ログが残るので、同じ組合せは翌日以降「実行待ち」に再出現しない**。

## 上限と無料運用

| リソース | 無料枠 | 想定使用 | 余裕 |
| --- | --- | --- | --- |
| GAS 実行時間 | 90 分/日 | ~30 分/日 (cron + 手動) | 67% |
| GAS 1 回実行 | 6 分 | ~3-5 分 (cron) | 17-50% |
| Gemini 2.5 Flash Lite | 1,500 req/日 | ~200-300 req/日 | 80% |
| UrlFetchApp | 20,000 req/日 | ~100 req/日 | 99% |
| Gmail 送信 | 100 通/日 (個人) / 1,500 (Workspace) | 数件/日 | ~99% |
| Spreadsheet セル | 10M | ~10,000 | 99.9% |

**月コスト: ¥0**

## トラブル対応

| 症状 | 原因 | 対処 |
| --- | --- | --- |
| `GEMINI_API_KEY が未設定` | スクリプトプロパティ未設定 | 手順 3 を実施 |
| トリガーが朝に動かない | タイムゾーン未設定 | 手順 4 で Asia/Tokyo に変更 |
| dailyCron 6 分超過 | (通常は起きない) 時間予算ガードで自動打切り | それでも出るなら Triggers.gs の `CRON_BUDGET` を小さくする |
| URL 自動補完で 0 件 | Gemini が「確証なし」と判断 | 手で recruit_page_url を入れる、または何度か試す |
| Gmail 下書きが作られない | onEdit トリガー未登録 | 手順 7 を再実行 |
| `Authorization` ダイアログが出る | 初回権限承認 | 自分のアカウントで OK を押すだけ |

## 設計の差分 (Vercel 版 → GAS 版)

| 項目 | Vercel 版 | GAS 版 |
| --- | --- | --- |
| DB | Supabase Postgres | Google Spreadsheet (タブ = テーブル) |
| 認証 | Supabase JWT + CRON_SECRET | Google アカウント (Spreadsheet 共有権限) |
| Cron | Vercel Cron 2 本/日 (60s 上限) | GAS Time Trigger 1 本/日 (6 分上限) |
| 並列処理 | 5 並列 (Gemini × Jina) | 直列 (GAS は並列不可) |
| 1 cron 処理量 | 50 社 (parallel) | 15 社 (serial) |
| メール送信 | 別途 Gmail OAuth が必要 | **GmailApp で本人 Gmail から即送信** |
| UI | React (Vercel) | Spreadsheet 直接編集 |
| 編集の UX | モーダル経由 | **セル直接編集** |
| 月コスト | ¥0 | ¥0 |
| **強み** | 大量処理・並列性能 | **触り心地・編集自由度・Gmail 直結** |

## スケール想定

- 〜500 社まで: 余裕
- 1,000 社: 6 分制限が効き始める。`runCrawl(8)` に絞る or サイクルを 7 日 → 14 日に
- 5,000 社+: Vercel 版に移行を検討

## ライセンス

社内ツール。MIT 相当。
