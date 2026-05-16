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
