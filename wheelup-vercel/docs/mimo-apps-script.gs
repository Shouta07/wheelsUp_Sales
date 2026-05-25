/**
 * WheelsUp ミモ議事録 自動連携 — Google Apps Script
 *
 * 役割: ミモが Drive に保存した議事録を、本人 (yamamoto@wheelsup.jp) の権限で読み、
 *       WheelsUp 面談FBシステムの push-transcript エンドポイントに送信する。
 *
 * なぜこの方式か:
 *   サービスアカウント (外部アカウント) は Workspace の組織ポリシーで Drive 共有を
 *   ブロックされる。Apps Script は「本人のアカウント」で動くため、本人がアクセスできる
 *   フォルダは普通に読める → 外部共有設定が一切不要。
 *
 * ───────────── セットアップ手順 ─────────────
 *  1. https://script.google.com/ を開く (yamamoto@wheelsup.jp でログイン)
 *  2. 「新しいプロジェクト」
 *  3. このファイルの中身を全部貼り付け
 *  4. 下記 CONFIG の API_SECRET を Vercel の CRON_SECRET と同じ値に書き換え
 *  5. 上部メニュー「実行」→ 関数 importOnce を一度手動実行
 *     → 初回は「承認が必要」と出るので、自分のアカウントで許可する
 *     → ログに { imported: N } が出れば成功
 *  6. 自動化: 左メニュー「トリガー」(時計アイコン) → 「トリガーを追加」
 *     - 実行する関数: importOnce
 *     - イベントのソース: 時間主導型
 *     - 時間ベースのタイマー: 分ベースのタイマー → 10 分おき
 *     → 保存
 *
 *  以降、10 分おきに自動で新着議事録が取り込まれ、採点され、Lark に通知が飛ぶ。
 */

// ============ CONFIG (ここだけ書き換える) ============
const CONFIG = {
  // ミモが議事録を保存する親フォルダの ID (URL の /folders/ の後ろ)
  ROOT_FOLDER_ID: "1gfSTjZ5NsEymME1SDsFLbJgISiSd_Oy0",

  // WheelsUp 本番 URL
  API_BASE: "https://sales-enablement-r-asystem.vercel.app",

  // Vercel の CRON_SECRET と同じ値にする (重要)
  API_SECRET: "ここに CRON_SECRET を貼る",

  // 取り込んだら自動採点も実行するか
  AUTO_SCORE: true,

  // サブフォルダ何階層まで潜るか (CA ごとのサブフォルダ運用 = 2 で十分)
  MAX_DEPTH: 3,

  // 1 回の実行で送る最大ファイル数 (多すぎる時の保険)
  MAX_FILES_PER_RUN: 30,
};
// ====================================================

/**
 * メイン関数。トリガーから 10 分おきに呼ばれる。
 * 前回の実行時刻以降に更新されたファイルだけを送る (差分取り込み)。
 */
function importOnce() {
  const props = PropertiesService.getScriptProperties();
  const lastRun = props.getProperty("lastRunTime"); // ISO 文字列 or null
  const sinceMs = lastRun ? new Date(lastRun).getTime() : 0;

  const root = DriveApp.getFolderById(CONFIG.ROOT_FOLDER_ID);
  const collected = [];
  collectFiles(root, null, 1, sinceMs, collected);

  if (collected.length === 0) {
    Logger.log("新着ファイルなし (since=" + (lastRun || "全期間") + ")");
    // 何もなくても lastRun は進める (空振りを減らす)
    props.setProperty("lastRunTime", new Date().toISOString());
    return;
  }

  // MAX_FILES_PER_RUN で打ち切り (古い順に処理したいので updatedTime 昇順)
  collected.sort((a, b) => a._updatedMs - b._updatedMs);
  const batch = collected.slice(0, CONFIG.MAX_FILES_PER_RUN);

  const payload = {
    auto_score: CONFIG.AUTO_SCORE,
    files: batch.map((c) => ({
      file_id: c.fileId,
      file_name: c.fileName,
      parent_folder_name: c.parentFolderName,
      content: c.content,
      created_time: c.createdTime,
    })),
  };

  const url = CONFIG.API_BASE + "/api/meetings/push-transcript?secret=" + encodeURIComponent(CONFIG.API_SECRET);
  const res = UrlFetchApp.fetch(url, {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });

  const code = res.getResponseCode();
  const text = res.getContentText();
  Logger.log("POST " + code + ": " + text);

  if (code >= 200 && code < 300) {
    // 成功した時だけ lastRun を進める (失敗時は次回再送)
    // 送ったバッチの最大 updatedTime を次回の基準にする
    const maxMs = Math.max.apply(null, batch.map((c) => c._updatedMs));
    props.setProperty("lastRunTime", new Date(maxMs).toISOString());
  } else {
    Logger.log("送信失敗。次回再試行します。");
  }
}

/**
 * フォルダを再帰的に巡回して、sinceMs 以降に更新された議事録ファイルを集める。
 */
function collectFiles(folder, parentFolderName, depth, sinceMs, out) {
  if (depth > CONFIG.MAX_DEPTH) return;

  // このフォルダ内のファイル
  const files = folder.getFiles();
  while (files.hasNext()) {
    const file = files.next();
    const updatedMs = file.getLastUpdated().getTime();
    if (updatedMs <= sinceMs) continue; // 前回以降に更新されてないものはskip

    const content = extractText(file);
    if (!content || content.length < 50) continue;

    out.push({
      fileId: file.getId(),
      fileName: file.getName(),
      parentFolderName: parentFolderName,
      content: content,
      createdTime: file.getDateCreated().toISOString(),
      _updatedMs: updatedMs,
    });
  }

  // サブフォルダを再帰
  const subs = folder.getFolders();
  while (subs.hasNext()) {
    const sub = subs.next();
    collectFiles(sub, sub.getName(), depth + 1, sinceMs, out);
  }
}

/**
 * ファイルからテキストを抽出。Google Docs / プレーンテキストに対応。
 */
function extractText(file) {
  const mime = file.getMimeType();
  try {
    if (mime === MimeType.GOOGLE_DOCS) {
      // Google Docs はそのまま本文を取得
      return DocumentApp.openById(file.getId()).getBody().getText();
    }
    if (mime === MimeType.PLAIN_TEXT || mime === "text/plain") {
      return file.getBlob().getDataAsString("UTF-8");
    }
    // それ以外 (.txt 拡張子で MIME が違う場合等) も試しにテキスト化
    if (file.getName().match(/\.(txt|vtt|srt|md)$/i)) {
      return file.getBlob().getDataAsString("UTF-8");
    }
  } catch (e) {
    Logger.log("抽出失敗 " + file.getName() + ": " + e);
  }
  return "";
}

/**
 * 手動テスト用: 強制的に全ファイルを再送する (lastRun をリセット)。
 * デバッグや初回一括取り込みに使う。
 */
function resetAndImportAll() {
  PropertiesService.getScriptProperties().deleteProperty("lastRunTime");
  importOnce();
}
