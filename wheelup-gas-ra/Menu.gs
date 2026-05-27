/**
 * Menu — Spreadsheet にカスタムメニュー「🤖 RA」を追加。
 * onOpen は Spreadsheet を開いた時に自動で発火する simple trigger。
 */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('🤖 RA')
    .addItem('📥 初回セットアップ (タブ + 候補者)', 'doInitialSetup')
    .addItem('📥 企業マスタ 246社 投入 (内蔵・推奨)', 'doSeedCompanies')
    .addItem('📥 企業マスタ CSV 取り込み (手動貼付)', 'seedCompaniesFromCsv')
    .addSeparator()
    .addItem('🚀 初回一括処理 (5分・繰り返し推奨)', 'doBulk')
    .addSeparator()
    .addItem('🤖 URL 自動補完 (10 社)', 'doEnrich')
    .addItem('🕸 求人クロール (15 社)', 'doCrawl')
    .addItem('🎯 候補者マッチ (15 求人)', 'doMatch')
    .addItem('🔄 実行待ち 再生成', 'doRebuildReady')
    .addSeparator()
    .addItem('🔍 新規企業発掘 (Gemini 10 社)', 'doDiscover')
    .addItem('🧹 古い求人を閉じる (30日)', 'doCloseStale')
    .addSeparator()
    .addItem('⏰ トリガー設定 (毎朝7時 cron + onEdit)', 'setupTriggers')
    .addItem('🔑 API キー設定方法', 'showApiKeyHelp')
    .addToUi();
}

function doInitialSetup() {
  ensureSheets();
  seedCandidates();
}

function doSeedCompanies() {
  seedCompaniesBuiltin();
}

function doBulk() {
  toast_('一括処理を開始しました (最大 5 分)。完了までお待ちください…');
  var r = bulkProcess();
  var msg =
    'URL補完 ' + (r.enrich && r.enrich.enriched != null ? r.enrich.enriched : '-') + ' / ' +
    'クロール新規 ' + (r.crawl && r.crawl.newJobs != null ? r.crawl.newJobs : '-') + ' / ' +
    '採点 ' + (r.match && r.match.scored != null ? r.match.scored : '-') + ' → ' +
    '実行待ち ' + r.ready + ' 件 (' + r.elapsedSec + 's)';
  SpreadsheetApp.getUi().alert(
    '一括処理が完了しました。\n\n' + msg + '\n\n' +
    'まだ「企業マスタ」に recruit_page_url が空の行が残っている場合は、\n' +
    'もう一度「🚀 初回一括処理」を押すと続きから処理します。'
  );
}

function doEnrich() {
  var r = runEnrich(10);
  toast_('URL 補完: ' + r.enriched + ' 件成功 / ' + r.failed + ' 件失敗');
}

function doCrawl() {
  var r = runCrawl(15);
  toast_('クロール: 新規 ' + r.newJobs + ' 件 / 更新 ' + r.updated + ' 件 / 失敗 ' + r.failed + ' 件');
}

function doMatch() {
  var r = runMatch(15);
  var n = rebuildReady();
  toast_('採点: ' + r.scored + ' / スキップ ' + r.skipped + ' / 失敗 ' + r.failed + ' → 実行待ち ' + n + ' 件');
}

function doRebuildReady() {
  var n = rebuildReady();
  toast_('実行待ち: ' + n + ' 件');
}

function doDiscover() {
  var r = runDiscover(10);
  toast_('発掘: 提案 ' + r.suggested + ' / 新規追加 ' + r.added);
}

function doCloseStale() {
  var n = closeStaleJobs(30);
  toast_('30 日更新なしの ' + n + ' 求人を closed に');
}

function showApiKeyHelp() {
  SpreadsheetApp.getUi().alert(
    'API キーは Apps Script Editor の以下から設定してください:\n' +
    '  プロジェクトの設定 (歯車アイコン) → スクリプト プロパティ\n\n' +
    '必須:  GEMINI_API_KEY     (https://aistudio.google.com で取得)\n' +
    '任意:  GEMINI_MODEL       (デフォルト: gemini-2.5-flash-lite)\n' +
    '任意:  JINA_API_KEY       (https://jina.ai/ で無料登録)'
  );
}

function toast_(msg) {
  SpreadsheetApp.getActive().toast(msg, '🤖 RA', 5);
}
