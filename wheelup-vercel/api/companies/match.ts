import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getSupabaseAdmin } from "../_lib/supabase-admin.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const db = getSupabaseAdmin();
  const { keywords } = req.body;

  if (!keywords || keywords.length === 0) {
    return res.status(400).json({ error: "キーワードを1つ以上指定してください" });
  }

  const queryKws: string[] = keywords.map((k: string) => k.trim().toLowerCase());

  const { data: companies } = await db.from("companies").select("*").order("name");
  if (!companies) return res.json({ results: [], total: 0, query_keywords: queryKws });

  const results: Array<Record<string, unknown>> = [];

  for (const c of companies) {
    const companyKws: string[] = ((c.keywords as string[]) || []).map((k) => k.toLowerCase());
    const hits = queryKws.filter((kw) => companyKws.some((ck) => ck.includes(kw)));

    if (hits.length === 0) continue;

    const pitchSummary: string[] = [];
    for (const kw of hits) {
      let found = false;
      for (const [origKw, point] of Object.entries((c.pitch_points as Record<string, string>) || {})) {
        if (origKw.toLowerCase().includes(kw)) {
          pitchSummary.push(`【${origKw}】${point}`);
          found = true;
          break;
        }
      }
      if (!found) pitchSummary.push(`【${kw}】該当あり`);
    }

    results.push({
      company: c,
      matched_keywords: hits,
      match_score: hits.length,
      pitch_summary: pitchSummary,
    });
  }

  results.sort((a, b) => (b.match_score as number) - (a.match_score as number));

  return res.json({ results, total: results.length, query_keywords: queryKws });
}
