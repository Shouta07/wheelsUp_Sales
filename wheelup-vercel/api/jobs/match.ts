import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getSupabaseAdmin } from "../_lib/supabase-admin.js";

/**
 * 候補者 × 求人 キーワードマッチング
 * POST /api/jobs/match
 * Body: { candidate_id: string } or { keywords: string[] }
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const db = getSupabaseAdmin();
  const { candidate_id, keywords: rawKeywords } = req.body;

  let queryKws: string[] = [];

  if (candidate_id) {
    const { data: candidate, error } = await db
      .from("candidates")
      .select("desired_keywords, desired_position, desired_location, current_industry, qualifications")
      .eq("id", candidate_id)
      .single();
    if (error || !candidate) {
      return res.status(404).json({ error: "候補者が見つかりません" });
    }
    queryKws = [
      ...((candidate.desired_keywords as string[]) || []),
      ...((candidate.qualifications as string[]) || []),
    ];
    if (candidate.desired_position) queryKws.push(candidate.desired_position as string);
    if (candidate.current_industry) queryKws.push(candidate.current_industry as string);
  } else if (rawKeywords && Array.isArray(rawKeywords)) {
    queryKws = rawKeywords;
  } else {
    return res.status(400).json({ error: "candidate_id または keywords が必要です" });
  }

  queryKws = queryKws.map((k) => k.trim().toLowerCase()).filter(Boolean);
  if (queryKws.length === 0) {
    return res.json({ results: [], total: 0, query_keywords: [] });
  }

  const { data: jobs } = await db
    .from("job_postings")
    .select("*, companies(id, name)")
    .eq("status", "open")
    .order("created_at", { ascending: false });

  if (!jobs) return res.json({ results: [], total: 0, query_keywords: queryKws });

  const results: Array<Record<string, unknown>> = [];

  for (const job of jobs) {
    const jobKws: string[] = [
      ...((job.keywords as string[]) || []),
      ...((job.requirements as string[]) || []),
      ...((job.required_qualifications as string[]) || []),
    ].map((k) => k.toLowerCase());

    if (job.position_type) jobKws.push((job.position_type as string).toLowerCase());
    if (job.location) jobKws.push((job.location as string).toLowerCase());
    if (job.title) jobKws.push((job.title as string).toLowerCase());

    const hits = queryKws.filter((kw) =>
      jobKws.some((jk) => jk.includes(kw) || kw.includes(jk)),
    );

    if (hits.length === 0) continue;

    results.push({
      job,
      matched_keywords: hits,
      match_score: hits.length,
    });
  }

  results.sort((a, b) => (b.match_score as number) - (a.match_score as number));

  return res.json({ results, total: results.length, query_keywords: queryKws });
}
