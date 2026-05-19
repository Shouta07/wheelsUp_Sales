/**
 * Web fetcher for RA. Prefers Jina Reader (clean markdown), falls back to
 * plain fetch + tag stripping when JINA_API_KEY is absent.
 */
import { createHash } from "node:crypto";

const JINA = process.env.JINA_API_KEY;

export async function fetchPage(url: string): Promise<string> {
  if (JINA) {
    const res = await fetch(`https://r.jina.ai/${url}`, {
      headers: { Authorization: `Bearer ${JINA}` },
    });
    if (res.ok) return await res.text();
  }
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 wheelup-prospecting/0.1" },
  });
  if (!res.ok) throw new Error(`fetch ${url} → ${res.status}`);
  const html = await res.text();
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/**
 * HEAD-check (or shallow GET fallback) to verify a URL actually responds.
 * Used to validate Gemini-suggested URLs before persisting them, so we don't
 * fill the DB with hallucinated 404s.
 *
 * Returns true iff the URL returns a 2xx/3xx status within the timeout.
 * Network errors / 4xx / 5xx → false.
 */
export async function urlExists(url: string, timeoutMs = 5000): Promise<boolean> {
  if (!url || !/^https?:\/\//i.test(url)) return false;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    // Some sites block HEAD; try HEAD first, fall back to a tiny GET on 405.
    let res = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: ctrl.signal,
      headers: { "User-Agent": "Mozilla/5.0 wheelup-prospecting/0.1 (url-check)" },
    });
    if (res.status === 405 || res.status === 501) {
      res = await fetch(url, {
        method: "GET",
        redirect: "follow",
        signal: ctrl.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 wheelup-prospecting/0.1 (url-check)",
          // Range hint asks for the first bytes only.
          Range: "bytes=0-0",
        },
      });
    }
    return res.status < 400;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}

/**
 * 採用ページかどうかをコンテンツで検証する。
 * urlExists() の 200 OK は通るが「トップにリダイレクトされた」「404 を 200 で返す」
 * ケースを排除するため、本文に採用関連キーワードがあるかをチェック。
 *
 * Returns:
 *  - true:  本文に採用/求人キーワードあり → 信頼できる
 *  - false: 200 OK だが採用ページではなさそう → 棄却 (再 enrich の対象)
 */
const RECRUIT_KEYWORDS = [
  "採用", "求人", "募集", "中途採用", "新卒採用", "キャリア採用", "キャリア",
  "join us", "join our", "careers", "career", "recruit", "hiring", "we are hiring",
  "jobs at", "open positions", "現在募集中",
];

export async function verifyRecruitContent(url: string, timeoutMs = 6000): Promise<boolean> {
  if (!url || !/^https?:\/\//i.test(url)) return false;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: ctrl.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 wheelup-prospecting/0.1 (content-check)",
        // 全文取らずに先頭だけ。長大なページの転送量を節約。
        Range: "bytes=0-65535",
      },
    });
    if (res.status >= 400) return false;
    const html = await res.text();
    // タグ除去後の小文字テキストでキーワード判定。
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .toLowerCase()
      .slice(0, 20000); // 先頭 20KB 分だけ見れば十分
    return RECRUIT_KEYWORDS.some((k) => text.includes(k.toLowerCase()));
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}

/** 会社サイト URL を見て、そのページに採用ページへのリンクが含まれているか軽くチェック。 */
const CORPORATE_KEYWORDS = ["会社概要", "事業内容", "コーポレート", "about", "company"];

export async function verifyCorporateContent(url: string, timeoutMs = 5000): Promise<boolean> {
  if (!url || !/^https?:\/\//i.test(url)) return false;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: ctrl.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 wheelup-prospecting/0.1 (content-check)",
        Range: "bytes=0-32768",
      },
    });
    if (res.status >= 400) return false;
    const html = await res.text();
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .toLowerCase()
      .slice(0, 16000);
    // 会社サイトっぽいキーワードがあれば OK。なくても 200 ならとりあえず通す
    // (一部の単純な LP しか持ってない企業もあるため)。
    return CORPORATE_KEYWORDS.some((k) => text.includes(k.toLowerCase())) || text.length > 1000;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}
