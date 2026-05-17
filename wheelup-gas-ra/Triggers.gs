/**
 * Triggers — daily cron + onEdit handler for the 「実行待ち」 sent-checkbox.
 *
 * Schedule:
 *   dailyCron() runs once a day at the hour specified by the time-based trigger
 *   (set up in setupTriggers()).
 *
 * On-edit:
 *   When the user ticks the "sent" checkbox in 実行待ち, we:
 *     1. Append a 'sent' row to 活動ログ
 *     2. Create a Gmail draft (if contact_email is present) so user can
 *        edit body and send manually
 */

function dailyCron() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5 * 1000)) {
    Logger.log('dailyCron: lock busy, skipping this run');
    return;
  }
  try {
    var t0 = Date.now();
    var e = safe_(function () { return runEnrich(10); });
    var c = safe_(function () { return runCrawl(15); });
    var m = safe_(function () { return runMatch(15); });
    var staleClosed = safe_(function () { return closeStaleJobs(30); });
    var readyCount = safe_(function () { return rebuildReady(); });
    var elapsedSec = Math.round((Date.now() - t0) / 1000);
    Logger.log('dailyCron done in ' + elapsedSec + 's — enrich=' + JSON.stringify(e) +
               ' crawl=' + JSON.stringify(c) + ' match=' + JSON.stringify(m) +
               ' staleClosed=' + JSON.stringify(staleClosed) + ' ready=' + readyCount);
  } finally {
    lock.releaseLock();
  }
}

function safe_(fn) {
  try { return fn(); } catch (e) { return 'error: ' + e.message; }
}

/**
 * onEdit — checkbox-driven send recording + Gmail draft creation.
 * The trigger is automatically wired via setupTriggers().
 */
function onEdit(e) {
  if (!e || !e.range) return;
  var sheet = e.range.getSheet();
  if (sheet.getName() !== SHEETS.ready) return;

  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var sentColIdx = headers.indexOf('sent') + 1;
  if (e.range.getColumn() !== sentColIdx) return;
  if (e.value !== 'TRUE') return;       // only react to a fresh check

  var row = e.range.getRow();
  var values = sheet.getRange(row, 1, 1, headers.length).getValues()[0];
  var rec = {};
  headers.forEach(function (h, i) { rec[h] = values[i]; });

  // 1) record to 活動ログ
  appendRow_(SHEETS.activities, {
    id: Utilities.getUuid(),
    occurred_at: new Date().toISOString(),
    company_name: rec.company_name,
    job_title: rec.job_title,
    candidate_name: rec.candidate_name,
    kind: 'sent',
    channel: rec.contact_form_url ? 'form' : (rec.contact_email ? 'email' : 'manual'),
    body: rec.candidate_name + ' → ' + rec.company_name + ' / ' + rec.job_title,
  });

  // 2) optional: stage Gmail draft so user can edit + send
  if (rec.contact_email) {
    var subject = '【' + rec.candidate_name + '様のご紹介】' + rec.job_title;
    var body =
      rec.company_name + ' ご担当者様\n\n' +
      'お世話になっております。\n\n' +
      '貴社の「' + rec.job_title + '」のポジションについて、弊社で支援している ' +
      rec.candidate_name + '様 をご紹介させてください。\n\n' +
      '【マッチング根拠】\n' + rec.reasons + '\n\n' +
      '※ 本文はこのまま送らず、必ず確認・編集してから送信してください。\n\n' +
      '—— Wheels Up RA';
    GmailApp.createDraft(rec.contact_email, subject, body);
  }
}

/**
 * setupTriggers — call this ONCE from the menu (or manually) to wire up
 * the time-based daily cron and the onEdit handler.
 */
function setupTriggers() {
  // Clean slate
  var existing = ScriptApp.getProjectTriggers();
  for (var i = 0; i < existing.length; i++) ScriptApp.deleteTrigger(existing[i]);

  // Daily at 7am JST. Apps Script triggers use the script's timezone (set via
  // File → Project properties), so make sure your project timezone is Asia/Tokyo.
  ScriptApp.newTrigger('dailyCron').timeBased().atHour(7).everyDays(1).create();

  // onEdit (installable trigger — required for GmailApp + property access)
  ScriptApp.newTrigger('onEdit').forSpreadsheet(SpreadsheetApp.getActive()).onEdit().create();

  SpreadsheetApp.getUi().alert(
    'トリガーを設定しました:\n' +
    '  • 毎朝 7:00 (Asia/Tokyo) に dailyCron 実行\n' +
    '  • 実行待ちタブの sent チェックで onEdit 起動 (活動ログ + Gmail 下書き)'
  );
}
