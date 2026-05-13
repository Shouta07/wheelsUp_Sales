// Fetch page text. Prefers Jina Reader (https://r.jina.ai/) — markdown-clean.
// Falls back to plain fetch + crude HTML strip.

export async function fetchPageText(url: string): Promise<string> {
  const key = process.env.JINA_API_KEY;
  try {
    if (key) {
      const res = await fetch(`https://r.jina.ai/${url}`, {
        headers: { Authorization: `Bearer ${key}`, "X-Return-Format": "markdown" },
        cache: "no-store",
      });
      if (res.ok) return await res.text();
    } else {
      const res = await fetch(`https://r.jina.ai/${url}`, { cache: "no-store" });
      if (res.ok) return await res.text();
    }
  } catch {
    // fall through
  }
  // Fallback: plain fetch and strip tags.
  const res = await fetch(url, {
    headers: { "User-Agent": "wheelsup-sales-bot/1.0 (+contact)" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`fetch failed: ${res.status} ${url}`);
  const html = await res.text();
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
