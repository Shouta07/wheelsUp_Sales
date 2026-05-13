// Web fetcher — prefers Jina Reader (returns clean markdown) and falls back to
// a plain HTML fetch with a crude tag stripper when JINA_API_KEY is absent.

const JINA = process.env.JINA_API_KEY;

export async function fetchPage(url: string): Promise<string> {
  if (JINA) {
    const res = await fetch(`https://r.jina.ai/${url}`, {
      headers: { Authorization: `Bearer ${JINA}` },
      cache: "no-store",
    });
    if (res.ok) return await res.text();
  }
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 wheelup-prospecting/0.1 (+https://wheelsup.local)",
    },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`fetch ${url} → ${res.status}`);
  const html = await res.text();
  return htmlToText(html);
}

function htmlToText(html: string): string {
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

export async function sha256(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
