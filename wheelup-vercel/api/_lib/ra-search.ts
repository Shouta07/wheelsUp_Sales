/**
 * Google Programmable Search Engine (Custom Search JSON API) — 無料 100 req/日。
 * 環境変数:
 *   GOOGLE_SEARCH_API_KEY   Google Cloud Console で発行
 *   GOOGLE_SEARCH_CX        Programmable Search Engine の検索エンジン ID
 *
 * 未設定なら空配列を返すフォールバック。
 */

const GOOGLE_KEY = process.env.GOOGLE_SEARCH_API_KEY;
const GOOGLE_CX  = process.env.GOOGLE_SEARCH_CX;

export const hasGoogleSearch = Boolean(GOOGLE_KEY && GOOGLE_CX);

export type SearchHit = { title: string; link: string; snippet: string };

export async function googleSearch(query: string, limit = 5): Promise<SearchHit[]> {
  if (!hasGoogleSearch) return [];
  const u = new URL("https://www.googleapis.com/customsearch/v1");
  u.searchParams.set("key", GOOGLE_KEY!);
  u.searchParams.set("cx", GOOGLE_CX!);
  u.searchParams.set("q", query);
  u.searchParams.set("num", String(Math.min(limit, 10)));
  u.searchParams.set("hl", "ja");
  u.searchParams.set("gl", "jp");
  try {
    const res = await fetch(u.toString(), { cache: "no-store" });
    if (!res.ok) return [];
    const data = (await res.json()) as { items?: Array<{ title?: string; link?: string; snippet?: string }> };
    return (data.items ?? []).map((it) => ({
      title:   it.title   ?? "",
      link:    it.link    ?? "",
      snippet: it.snippet ?? "",
    })).filter((h) => h.link);
  } catch {
    return [];
  }
}
