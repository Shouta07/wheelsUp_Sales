/**
 * Wheels Up RA prospecting — Google Apps Script (GAS) implementation.
 * Drop-in port of the Vercel + Supabase version, operating directly on
 * a Google Spreadsheet.
 *
 * Files in this project:
 *   Main.gs       — core logic (Gemini, fetch, scoring, sheets I/O)
 *   Bootstrap.gs  — first-time setup (create tabs + headers, optional seed)
 *   Triggers.gs   — onEdit + daily cron entry points
 *   Menu.gs       — onOpen menu items
 *
 * Configuration via Project Settings → Script Properties:
 *   GEMINI_API_KEY  (required)  — AI Studio key
 *   GEMINI_MODEL    (optional)  — default: gemini-2.5-flash-lite
 *   JINA_API_KEY    (optional)  — for cleaner page fetching (free signup)
 *
 * See README.md for setup walk-through.
 */

const SHEETS = {
  companies:  '企業マスタ',
  jobs:       '求人',
  candidates: '候補者',
  matches:    'マッチ',
  activities: '活動ログ',
  discovery:  '発掘キュー',
  ready:      '実行待ち',
};

// =============================================================================
// CONFIG
// =============================================================================

function getProp_(key) {
  return PropertiesService.getScriptProperties().getProperty(key);
}

// =============================================================================
// GEMINI
// =============================================================================

function callGemini_(prompt, opts) {
  const key = getProp_('GEMINI_API_KEY');
  if (!key) throw new Error('GEMINI_API_KEY が未設定です。Script Properties に追加してください。');
  const model = getProp_('GEMINI_MODEL') || 'gemini-2.5-flash-lite';
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent?key=' + key;

  const res = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: (opts && opts.temperature) != null ? opts.temperature : 0.2,
        responseMimeType: 'application/json',
        maxOutputTokens: (opts && opts.maxOutputTokens) || 2048,
      },
    }),
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() >= 400) {
    throw new Error('Gemini ' + res.getResponseCode() + ': ' + res.getContentText().slice(0, 400));
  }
  const data = JSON.parse(res.getContentText());
  const parts = (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || [];
  const text = parts.map(function (p) { return p.text || ''; }).join('');
  const cleaned = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/g, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    throw new Error('Gemini JSON parse failed: ' + e.message + '\n---\n' + text.slice(0, 400));
  }
}

// =============================================================================
// FETCH (Jina Reader preferred, plain fetch fallback) + URL existence check
// =============================================================================

function fetchPage_(url) {
  const jina = getProp_('JINA_API_KEY');
  // Jina Reader: always callable, key only required for higher quota
  try {
    const res = UrlFetchApp.fetch('https://r.jina.ai/' + url, {
      headers: jina ? { Authorization: 'Bearer ' + jina } : {},
      muteHttpExceptions: true,
    });
    if (res.getResponseCode() < 400) return res.getContentText();
  } catch (e) { /* fall through */ }

  const res = UrlFetchApp.fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 wheelup-gas-ra/0.1' },
    muteHttpExceptions: true,
    followRedirects: true,
  });
  if (res.getResponseCode() >= 400) throw new Error('fetch ' + url + ' → ' + res.getResponseCode());
  return htmlToText_(res.getContentText());
}

function htmlToText_(html) {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function urlExists_(url) {
  if (!url || !/^https?:\/\//i.test(url)) return false;
  try {
    var res = UrlFetchApp.fetch(url, {
      method: 'head', muteHttpExceptions: true, followRedirects: true,
      headers: { 'User-Agent': 'Mozilla/5.0 wheelup-gas-ra/0.1 (url-check)' },
    });
    var code = res.getResponseCode();
    if (code === 405 || code === 501) {
      res = UrlFetchApp.fetch(url, {
        method: 'get', muteHttpExceptions: true, followRedirects: true,
        headers: { 'User-Agent': 'Mozilla/5.0 wheelup-gas-ra/0.1 (url-check)', Range: 'bytes=0-0' },
      });
      code = res.getResponseCode();
    }
    return code < 400;
  } catch (e) {
    return false;
  }
}

function sha256_(input) {
  var raw = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, input, Utilities.Charset.UTF_8);
  return raw.map(function (b) { return ((b < 0 ? b + 256 : b)).toString(16); }).map(function (h) { return h.length === 1 ? '0' + h : h; }).join('');
}

// =============================================================================
// SHEET I/O HELPERS
// =============================================================================

function sh_(name) {
  return SpreadsheetApp.getActive().getSheetByName(name);
}

function readSheet_(name) {
  var s = sh_(name);
  if (!s) return [];
  var values = s.getDataRange().getValues();
  if (values.length < 2) return [];
  var headers = values[0];
  return values.slice(1).map(function (row) {
    var obj = {};
    headers.forEach(function (h, i) { obj[h] = row[i]; });
    return obj;
  });
}

function appendRow_(name, row) {
  var s = sh_(name);
  var headers = s.getRange(1, 1, 1, s.getLastColumn()).getValues()[0];
  s.appendRow(headers.map(function (h) { return row[h] != null ? row[h] : ''; }));
}

/** rowIdx is 0-based index within data rows (header row 0 is excluded). */
function updateRow_(name, rowIdx, patch) {
  var s = sh_(name);
  var headers = s.getRange(1, 1, 1, s.getLastColumn()).getValues()[0];
  headers.forEach(function (h, i) {
    if (patch[h] !== undefined) s.getRange(rowIdx + 2, i + 1).setValue(patch[h]);
  });
}

// =============================================================================
// ENRICH — Gemini guesses URLs for companies with no recruit_page_url
// =============================================================================

function runEnrich(limit, deadline) {
  var n = limit || 10;
  var companies = readSheet_(SHEETS.companies);
  var targets = [];
  for (var i = 0; i < companies.length && targets.length < n; i++) {
    if (!companies[i].recruit_page_url && companies[i].name) {
      targets.push({ c: companies[i], i: i });
    }
  }
  var enriched = 0, failed = 0;
  for (var k = 0; k < targets.length; k++) {
    if (deadline && Date.now() >= deadline) break;   // 6分制限ガード
    var t = targets[k];
    try {
      var r = enrichOne_(t.c.name);
      var patch = {};
      if (r.corporate_url)    patch.corporate_url    = r.corporate_url;
      if (r.recruit_page_url) patch.recruit_page_url = r.recruit_page_url;
      if (r.contact_form_url) patch.contact_form_url = r.contact_form_url;
      if (r.contact_email)    patch.contact_email    = r.contact_email;
      if (r.linkedin_url)     patch.linkedin_url     = r.linkedin_url;
      updateRow_(SHEETS.companies, t.i, patch);
      enriched++;
    } catch (e) {
      failed++;
      Logger.log('enrich [' + t.c.name + '] failed: ' + e.message);
    }
  }
  return { enriched: enriched, failed: failed };
}

/**
 * 4 層フォールバックで企業 URL を高精度に特定する:
 *   Layer 1: Google Custom Search (4 クエリ) → Gemini が選別  ← GOOGLE_SEARCH_API_KEY / GOOGLE_SEARCH_CX 設定時のみ
 *   Layer 2: 2 段階 Gemini  (Corp URL → 実 HTML → /recruit /contact 抽出)
 *   Layer 3: パターン総当たり (/recruit, /careers, /採用, /contact... + HEAD)
 *   Layer 4: 単発 Gemini (最終フォールバック)
 * 各 URL は HEAD で検証してから返す。
 */
function enrichOne_(name) {
  var cand = { corporate: [], recruit: [], contact: [], linkedin: [] };
  var contact_email = null;
  var notes = [];

  // ── Layer 1: Google Custom Search ─────────────────────────────────
  if (hasGoogleSearch_()) {
    try {
      var corpHits     = googleSearch_(name + ' 公式サイト', 5);
      var recHits      = googleSearch_(name + ' 採用情報 OR 採用 OR careers OR recruit', 5);
      var contactHits  = googleSearch_(name + ' お問い合わせ OR 問い合わせ OR contact', 5);
      var linkedinHits = googleSearch_('site:linkedin.com/company ' + name, 3);
      var picked = pickFromSearchResults_(name, corpHits, recHits, contactHits, linkedinHits);
      if (picked.corporate_url)    cand.corporate.push(picked.corporate_url);
      if (picked.recruit_page_url) cand.recruit.push(picked.recruit_page_url);
      if (picked.contact_form_url) cand.contact.push(picked.contact_form_url);
      if (picked.linkedin_url)     cand.linkedin.push(picked.linkedin_url);
      notes.push('google-search');
    } catch (e) { notes.push('google-search failed: ' + e.message); }
  }

  // ── Layer 2: 2 段階 Gemini ────────────────────────────────────────
  if (cand.corporate.length === 0) {
    try {
      var corp = geminiSuggestCorpUrl_(name);
      if (corp) cand.corporate.push(corp);
    } catch (e) { /* ignore */ }
  }
  var firstCorp = firstValidUrl_(cand.corporate);
  if (firstCorp) {
    try {
      var body = fetchPage_(firstCorp);
      var paths = geminiExtractPathsFromHomepage_(name, firstCorp, body);
      paths.recruit_urls.forEach(function (u) { cand.recruit.push(u); });
      paths.contact_urls.forEach(function (u) { cand.contact.push(u); });
      if (paths.email && !contact_email) contact_email = paths.email;
      if (paths.linkedin) cand.linkedin.push(paths.linkedin);
      notes.push('site-extract');
    } catch (e) { notes.push('site-extract failed: ' + e.message); }
  }

  // ── Layer 3: パターン総当たり ─────────────────────────────────────
  if (firstCorp) {
    var root = firstCorp.replace(/\/+$/, '');
    ['/recruit/', '/recruit', '/careers/', '/careers', '/career', '/採用情報/', '/採用情報', '/jobs/', '/jobs']
      .forEach(function (p) { cand.recruit.push(root + p); });
    ['/contact/', '/contact', '/inquiry/', '/inquiry', '/contact-us/', '/contact-us', '/お問い合わせ/', '/お問い合わせ']
      .forEach(function (p) { cand.contact.push(root + p); });
  }

  // ── Layer 4: 単発 Gemini フォールバック ───────────────────────────
  if (cand.recruit.length === 0 && cand.contact.length === 0) {
    try {
      var s = geminiSingleShotAll_(name);
      if (s.corporate_url)    cand.corporate.push(s.corporate_url);
      if (s.recruit_page_url) cand.recruit.push(s.recruit_page_url);
      if (s.contact_form_url) cand.contact.push(s.contact_form_url);
      if (s.linkedin_url)     cand.linkedin.push(s.linkedin_url);
      if (s.contact_email && !contact_email) contact_email = s.contact_email;
      notes.push('single-gemini-fallback');
    } catch (e) { /* swallow */ }
  }

  // ── 最終 HEAD 検証 ────────────────────────────────────────────────
  return {
    corporate_url:    firstValidUrl_(dedupeUrls_(cand.corporate)),
    recruit_page_url: firstValidUrl_(dedupeUrls_(cand.recruit)),
    contact_form_url: firstValidUrl_(dedupeUrls_(cand.contact)),
    linkedin_url:     firstValidUrl_(dedupeUrls_(cand.linkedin)),
    contact_email:    contact_email,
    note:             notes.join(' | '),
  };
}

function dedupeUrls_(arr) {
  var seen = {}, out = [];
  for (var i = 0; i < arr.length; i++) {
    if (!arr[i]) continue;
    var key = String(arr[i]).replace(/\/+$/, '').toLowerCase();
    if (seen[key]) continue;
    seen[key] = true;
    out.push(arr[i]);
  }
  return out;
}

function firstValidUrl_(urls) {
  for (var i = 0; i < Math.min(urls.length, 6); i++) {
    if (urlExists_(urls[i])) return urls[i];
  }
  return null;
}

// =============================================================================
// GOOGLE CUSTOM SEARCH (Layer 1)
// =============================================================================

function hasGoogleSearch_() {
  return Boolean(getProp_('GOOGLE_SEARCH_API_KEY') && getProp_('GOOGLE_SEARCH_CX'));
}

function googleSearch_(query, limit) {
  var key = getProp_('GOOGLE_SEARCH_API_KEY');
  var cx  = getProp_('GOOGLE_SEARCH_CX');
  if (!key || !cx) return [];
  var url = 'https://www.googleapis.com/customsearch/v1' +
    '?key=' + encodeURIComponent(key) +
    '&cx=' + encodeURIComponent(cx) +
    '&q=' + encodeURIComponent(query) +
    '&num=' + Math.min(limit || 5, 10) +
    '&hl=ja&gl=jp';
  try {
    var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    if (res.getResponseCode() >= 400) return [];
    var data = JSON.parse(res.getContentText());
    return (data.items || []).map(function (it) {
      return { title: it.title || '', link: it.link || '', snippet: it.snippet || '' };
    }).filter(function (h) { return h.link; });
  } catch (e) { return []; }
}

function pickFromSearchResults_(name, corpHits, recHits, contactHits, linkedinHits) {
  var fmt = function (hs) {
    if (!hs || hs.length === 0) return '(なし)';
    return hs.map(function (x, i) {
      return (i + 1) + '. ' + x.link + '\n   ' + x.title + '\n   ' + x.snippet;
    }).join('\n');
  };
  var prompt =
    '日本企業「' + name + '」について、Google 検索結果から本物の URL を 1 つずつ選んでください。\n' +
    '転職メディア (Indeed / リクナビ / マイナビ / Wantedly 等) より公式サイトを優先。確証が無い項目は null。\n\n' +
    '# 公式サイト 候補\n' + fmt(corpHits) + '\n\n' +
    '# 採用情報 候補\n' + fmt(recHits) + '\n\n' +
    '# お問い合わせ 候補\n' + fmt(contactHits) + '\n\n' +
    '# LinkedIn 候補\n' + fmt(linkedinHits) + '\n\n' +
    'JSON のみ:\n' +
    '{ "corporate_url": "...|null", "recruit_page_url": "...|null", "contact_form_url": "...|null", "linkedin_url": "...|null" }';
  return callGemini_(prompt, { temperature: 0.1 });
}

// =============================================================================
// 2-STEP GEMINI (Layer 2)
// =============================================================================

function geminiSuggestCorpUrl_(name) {
  var prompt =
    '日本企業「' + name + '」のコーポレートサイト (公式サイト) のトップ URL を 1 つだけ返してください。\n' +
    '**確証が無いなら null**。推測でドメインをでっち上げないこと。\n\n' +
    'JSON のみ: { "url": "https://...|null" }';
  var r = callGemini_(prompt, { temperature: 0.1 });
  return (r && r.url) ? r.url : null;
}

function geminiExtractPathsFromHomepage_(name, corpUrl, body) {
  var prompt =
    '「' + name + '」のコーポレートサイト ' + corpUrl + ' のトップページから、以下のリンク・情報を**実際に本文に存在するもの**だけ抽出してください。推測で URL を作らないこと。\n\n' +
    '* 採用ページ (recruit / careers / 採用情報 / 採用案内 等のリンク先)\n' +
    '* お問い合わせフォーム (contact / 問い合わせ / inquiry)\n' +
    '* 公開メールアドレス (info@ や recruit@ 等)\n' +
    '* 公式 LinkedIn (linkedin.com/company/...)\n\n' +
    '複数候補があれば配列で返す。絶対 URL に整形 (相対パスはコーポレート URL に連結)。\n\n' +
    'JSON のみ:\n' +
    '{ "recruit_urls": ["..."], "contact_urls": ["..."], "email": "...|null", "linkedin": "...|null" }\n\n' +
    '--- ページ本文 ---\n' + String(body).slice(0, 15000);
  var r = callGemini_(prompt, { temperature: 0.1 });
  return {
    recruit_urls: Array.isArray(r && r.recruit_urls) ? r.recruit_urls.filter(Boolean) : [],
    contact_urls: Array.isArray(r && r.contact_urls) ? r.contact_urls.filter(Boolean) : [],
    email:        (r && r.email) || null,
    linkedin:     (r && r.linkedin) || null,
  };
}

// =============================================================================
// SINGLE-SHOT GEMINI (Layer 4 fallback)
// =============================================================================

function geminiSingleShotAll_(name) {
  var prompt =
    '日本企業「' + name + '」について、以下 5 種類の URL / 情報を可能な限り推定。\n' +
    '**確証が無いものは null**。\n\n' +
    'JSON のみ:\n' +
    '{\n' +
    '  "corporate_url":    "https://...|null",\n' +
    '  "recruit_page_url": "https://...|null",\n' +
    '  "contact_form_url": "https://...|null",\n' +
    '  "contact_email":    "info@...|null",\n' +
    '  "linkedin_url":     "https://www.linkedin.com/company/...|null"\n' +
    '}';
  return callGemini_(prompt, { temperature: 0.1 });
}

// =============================================================================
// CRAWL — fetch recruit_page_url, extract jobs with Gemini
// =============================================================================

function runCrawl(limit, deadline) {
  var n = limit || 10;
  var companies = readSheet_(SHEETS.companies)
    .map(function (c, i) { return { c: c, i: i }; })
    .filter(function (x) { return x.c.recruit_page_url; })
    .sort(function (a, b) {
      var av = a.c.last_crawled_at || '';
      var bv = b.c.last_crawled_at || '';
      return av < bv ? -1 : (av > bv ? 1 : 0);
    })
    .slice(0, n);

  var jobs = readSheet_(SHEETS.jobs);
  var jobIndex = {};
  jobs.forEach(function (j, i) {
    jobIndex[j.company_name + '|' + j.content_hash] = i;
  });

  var newJobs = 0, updated = 0, failed = 0;
  for (var k = 0; k < companies.length; k++) {
    if (deadline && Date.now() >= deadline) break;   // 6分制限ガード
    var t = companies[k];
    try {
      var body = fetchPage_(t.c.recruit_page_url);
      var extracted = extractJobs_(t.c.name, body);
      for (var j = 0; j < extracted.length; j++) {
        var ej = extracted[j];
        var hash = sha256_(ej.title + '\n' + (ej.description || '') + '\n' + (ej.requirements || ''));
        var key = t.c.name + '|' + hash;
        if (jobIndex[key] != null) {
          updateRow_(SHEETS.jobs, jobIndex[key], { last_seen_at: new Date().toISOString(), is_open: true });
          updated++;
        } else {
          appendRow_(SHEETS.jobs, {
            id: Utilities.getUuid(),
            company_name: t.c.name,
            title: ej.title,
            description: ej.description || '',
            requirements: ej.requirements || '',
            employment_type: ej.employment_type || '',
            location: ej.location || '',
            salary_range: ej.salary_range || '',
            url: ej.url || t.c.recruit_page_url,
            content_hash: hash,
            is_open: true,
            first_seen_at: new Date().toISOString(),
            last_seen_at:  new Date().toISOString(),
            closed_at: '',
          });
          newJobs++;
        }
      }
      updateRow_(SHEETS.companies, t.i, { last_crawled_at: new Date().toISOString() });
    } catch (e) {
      failed++;
      Logger.log('crawl [' + t.c.name + '] failed: ' + e.message);
    }
  }
  return { newJobs: newJobs, updated: updated, failed: failed };
}

function extractJobs_(companyName, body) {
  var prompt =
    'You are reading the careers page of "' + companyName + '" (a Japanese firm in the FM/PM/建築設備/施設管理/ゼネコン space). Extract every currently-open job listing in the text below.\n\n' +
    'Return STRICT JSON:\n' +
    '{\n' +
    '  "jobs": [\n' +
    '    {\n' +
    '      "title": "string",\n' +
    '      "description": "string (short)",\n' +
    '      "requirements": "string",\n' +
    '      "employment_type": "正社員 | 契約 | null",\n' +
    '      "location": "string | null",\n' +
    '      "salary_range": "string | null",\n' +
    '      "url": "string | null"\n' +
    '    }\n' +
    '  ]\n' +
    '}\n\n' +
    'If no concrete openings, return {"jobs": []}.\n\n' +
    '--- PAGE TEXT ---\n' +
    String(body).slice(0, 20000);
  var p = callGemini_(prompt);
  return Array.isArray(p && p.jobs) ? p.jobs : [];
}

// =============================================================================
// MATCH — open jobs × active candidates → ◎○△×
// =============================================================================

function runMatch(limit, deadline) {
  var n = limit || 10;
  var jobs = readSheet_(SHEETS.jobs)
    .filter(function (j) { return j.is_open === true || j.is_open === 'TRUE'; })
    .sort(function (a, b) {
      var av = a.last_seen_at || '';
      var bv = b.last_seen_at || '';
      return av < bv ? 1 : (av > bv ? -1 : 0);
    })
    .slice(0, n);
  var candidates = readSheet_(SHEETS.candidates)
    .filter(function (c) { return c.is_active === true || c.is_active === 'TRUE' || c.is_active === ''; });

  var matches = readSheet_(SHEETS.matches);
  var matched = {};
  matches.forEach(function (m) {
    matched[m.company_name + '|' + m.job_title + '|' + m.candidate_name] = true;
  });

  var scored = 0, skipped = 0, failed = 0;
  for (var i = 0; i < jobs.length; i++) {
    if (deadline && Date.now() >= deadline) break;   // 6分制限ガード
    for (var k = 0; k < candidates.length; k++) {
      if (deadline && Date.now() >= deadline) break;
      var j = jobs[i], c = candidates[k];
      var key = j.company_name + '|' + j.title + '|' + c.name;
      if (matched[key]) { skipped++; continue; }
      try {
        var s = scoreOne_(j, c);
        appendRow_(SHEETS.matches, {
          id: Utilities.getUuid(),
          company_name: j.company_name,
          job_title: j.title,
          candidate_name: c.name,
          grade: s.grade,
          score: s.score,
          reasons: (s.reasons || []).join(' / '),
          concerns: (s.concerns || []).join(' / '),
          created_at: new Date().toISOString(),
        });
        scored++;
      } catch (e) {
        failed++;
        Logger.log('match [' + j.title + ' × ' + c.name + ']: ' + e.message);
      }
    }
  }
  return { scored: scored, skipped: skipped, failed: failed };
}

function scoreOne_(job, candidate) {
  var prompt =
    'あなたは建築設備 / FM / PM / 施設管理 領域の日本のRAです。以下の求人 × 候補者の相性を ◎ ○ △ × で判定し、0-100点を付けてください。\n\n' +
    '# 候補者\n' +
    '名前: ' + candidate.name + '\n' +
    'ヘッドライン: ' + (candidate.headline || '') + '\n' +
    'specialties: '   + (candidate.specialties || '') + '\n' +
    'industries_ok: ' + (candidate.industries_ok || '') + '\n' +
    'deal_breakers: ' + (candidate.deal_breakers || '') + '\n' +
    'in_progress: '   + (candidate.in_progress || '') + '\n\n' +
    '# 求人\n' +
    'タイトル: '  + job.title + '\n' +
    '雇用形態: '  + (job.employment_type || '') + '\n' +
    '勤務地: '    + (job.location || '') + '\n' +
    '想定年収: '  + (job.salary_range || '') + '\n' +
    '説明: '      + (job.description || '') + '\n' +
    '必須要件: '  + (job.requirements || '') + '\n\n' +
    '# 判定基準\n' +
    '- ◎ = ほぼ確実にマッチ (specialties と一致、deal_breakers 抵触なし)\n' +
    '- ○ = 強くマッチ\n' +
    '- △ = 接戦\n' +
    '- × = 不適合\n\n' +
    'JSON のみ:\n' +
    '{ "grade": "◎|○|△|×", "score": 0-100, "reasons": ["..."], "concerns": ["..."] }';
  return callGemini_(prompt);
}

// =============================================================================
// DISCOVER — Gemini proposes new companies
// =============================================================================

function runDiscover(count) {
  var n = count || 10;
  var known = readSheet_(SHEETS.companies).map(function (c) { return c.name; }).filter(Boolean);
  var prompt =
    'あなたは日本の建築設備 / FM / PM / 施設管理 / ゼネコン業界に詳しいリサーチャーです。\n' +
    '既に下記の企業はターゲットリストに入っています:\n' +
    known.join(', ') + '\n\n' +
    'これら**以外**で、同じ領域の有力企業を ' + n + ' 社、新規に提案してください。\n\n' +
    'JSON のみ:\n' +
    '{ "suggestions": [ { "name": "...", "category": "...", "reason": "...", "hint_url": "..." } ] }';
  var p = callGemini_(prompt, { temperature: 0.4 });
  var suggestions = (p && p.suggestions) || [];
  var knownSet = {};
  known.forEach(function (k) { knownSet[k] = true; });
  var added = 0;
  for (var i = 0; i < suggestions.length; i++) {
    var s = suggestions[i];
    if (!s || !s.name || knownSet[s.name]) continue;
    appendRow_(SHEETS.discovery, {
      id: Utilities.getUuid(),
      name: s.name,
      category: s.category || '',
      reason: s.reason || '',
      hint_url: s.hint_url || '',
      status: 'pending',
      created_at: new Date().toISOString(),
    });
    added++;
  }
  return { suggested: suggestions.length, added: added };
}

// =============================================================================
// REBUILD READY — ◎○ かつ未送信を 実行待ち タブに書き出す
// =============================================================================

function rebuildReady() {
  var matches    = readSheet_(SHEETS.matches);
  var activities = readSheet_(SHEETS.activities);
  var companies  = readSheet_(SHEETS.companies);
  var jobs       = readSheet_(SHEETS.jobs);

  var compByName = {};
  companies.forEach(function (c) { compByName[c.name] = c; });

  var jobOpen = {};
  jobs.forEach(function (j) {
    if (j.is_open === true || j.is_open === 'TRUE') jobOpen[j.company_name + '|' + j.title] = true;
  });

  var sent = {};
  activities.forEach(function (a) {
    if (a.kind === 'sent' || a.kind === 'meeting' || a.kind === 'closed') {
      sent[a.company_name + '|' + a.job_title + '|' + a.candidate_name] = true;
    }
  });

  var rows = matches
    .filter(function (m) { return m.grade === '◎' || m.grade === '○'; })
    .filter(function (m) { return jobOpen[m.company_name + '|' + m.job_title]; })
    .filter(function (m) { return !sent[m.company_name + '|' + m.job_title + '|' + m.candidate_name]; })
    .map(function (m) {
      var c = compByName[m.company_name] || {};
      return {
        grade: m.grade,
        score: m.score,
        company_name: m.company_name,
        priority: c.priority || '',
        job_title: m.job_title,
        candidate_name: m.candidate_name,
        reasons: m.reasons,
        contact_form_url: c.contact_form_url || '',
        contact_email: c.contact_email || '',
        recruit_page_url: c.recruit_page_url || '',
        sent: false,
      };
    })
    .sort(function (a, b) {
      var gw = function (g) { return g === '◎' ? 0 : 1; };
      if (gw(a.grade) !== gw(b.grade)) return gw(a.grade) - gw(b.grade);
      return (Number(b.score) || 0) - (Number(a.score) || 0);
    });

  var s = sh_(SHEETS.ready);
  var headers = s.getRange(1, 1, 1, s.getLastColumn()).getValues()[0];
  if (s.getLastRow() > 1) s.getRange(2, 1, s.getLastRow() - 1, s.getLastColumn()).clearContent();
  if (rows.length === 0) return 0;
  var matrix = rows.map(function (r) { return headers.map(function (h) { return r[h] != null ? r[h] : ''; }); });
  s.getRange(2, 1, matrix.length, headers.length).setValues(matrix);
  // Insert checkbox column for "sent"
  var sentCol = headers.indexOf('sent') + 1;
  if (sentCol > 0) {
    s.getRange(2, sentCol, matrix.length, 1).insertCheckboxes();
  }
  return rows.length;
}

// =============================================================================
// CLOSE STALE JOBS — 30 日 last_seen_at が更新されてない jobs を閉じる
// =============================================================================

function closeStaleJobs(days) {
  var d = days || 30;
  var cutoff = Date.now() - d * 24 * 60 * 60 * 1000;
  var jobs = readSheet_(SHEETS.jobs);
  var closed = 0;
  jobs.forEach(function (j, i) {
    if (!(j.is_open === true || j.is_open === 'TRUE')) return;
    var lsa = j.last_seen_at ? new Date(j.last_seen_at).getTime() : 0;
    if (lsa < cutoff) {
      updateRow_(SHEETS.jobs, i, { is_open: false, closed_at: new Date().toISOString() });
      closed++;
    }
  });
  return closed;
}
