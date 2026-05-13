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
