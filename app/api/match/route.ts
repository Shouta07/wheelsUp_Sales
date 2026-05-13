import { requireSecret, sbInsert, sbSelect, supabaseConfigured } from "@/lib/supabase";
import { geminiConfigured, geminiJSON } from "@/lib/gemini";
import type { Candidate, Job, Match, Rank } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

interface Verdict {
  rank: Rank;
  score: number;
  reason: string;
  concerns?: string;
}

function buildPrompt(job: Job, candidate: Candidate): string {
  return `あなたはRA（人材紹介）の経験豊富なマッチング担当者です。
以下の求人と候補者を比較し、紹介適合度を判定してください。
ランク: ◎(強く推薦) / ◯(推薦) / △(微妙) / ×(不適合)
score は 0..100 の整数。reason は 2〜4 文の日本語、concerns は懸念点を 1〜2 文で。
JSON のみ返す: {"rank":"◎","score":85,"reason":"...","concerns":"..."}

[求人]
title: ${job.title}
employment_type: ${job.employment_type ?? ""}
location: ${job.location ?? ""}
salary: ${job.salary_min_jpy ?? ""} - ${job.salary_max_jpy ?? ""}
description: ${(job.description ?? "").slice(0, 1200)}
requirements: ${(job.requirements ?? "").slice(0, 800)}
preferred: ${(job.preferred ?? "").slice(0, 400)}

[候補者] ${candidate.name} (${candidate.code})
age: ${candidate.age ?? ""}
base: ${candidate.base_location ?? ""}
desired_locations: ${(candidate.desired_locations ?? []).join(",")}
desired_industries: ${(candidate.desired_industries ?? []).join(",")}
must_have: ${candidate.must_have ?? ""}
nice_to_have: ${candidate.nice_to_have ?? ""}
deal_breakers: ${candidate.deal_breakers ?? ""}
profile: ${JSON.stringify(candidate.profile).slice(0, 1500)}`;
}

export async function POST(req: Request) {
  const unauth = requireSecret(req);
  if (unauth) return unauth;
  if (!supabaseConfigured) return Response.json({ error: "Supabase not configured" }, { status: 400 });
  if (!geminiConfigured) return Response.json({ error: "GEMINI_API_KEY not set" }, { status: 400 });

  const url = new URL(req.url);
  const limit = Number(url.searchParams.get("limit") ?? "50");
  const jobId = url.searchParams.get("job_id");

  // Find jobs missing matches for at least one active candidate.
  const candidates = await sbSelect<Candidate>("candidates", "select=*&is_active=eq.true");
  if (!candidates.length) return Response.json({ ok: true, stats: { matched: 0 }, note: "no candidates" });

  const jobsQuery = jobId
    ? `select=*&id=eq.${jobId}`
    : `select=*&is_open=eq.true&order=last_seen_at.desc&limit=${limit}`;
  const jobs = await sbSelect<Job>("jobs", jobsQuery);

  // Pull existing matches for those jobs in one shot.
  const jobIds = jobs.map((j) => j.id);
  let existing: Match[] = [];
  if (jobIds.length) {
    existing = await sbSelect<Match>(
      "matches",
      `select=job_id,candidate_id&job_id=in.(${jobIds.join(",")})`
    );
  }
  const seen = new Set(existing.map((m) => `${m.job_id}|${m.candidate_id}`));

  const runStart = new Date().toISOString();
  const toInsert: Record<string, unknown>[] = [];
  let errors = 0;
  for (const job of jobs) {
    for (const cand of candidates) {
      const key = `${job.id}|${cand.id}`;
      if (seen.has(key)) continue;
      try {
        const v = await geminiJSON<Verdict>(buildPrompt(job, cand));
        const rank = (["◎","◯","△","×"].includes(v.rank) ? v.rank : "△") as Rank;
        const score = Math.max(0, Math.min(100, Math.round(Number(v.score) || 0)));
        toInsert.push({
          job_id: job.id,
          candidate_id: cand.id,
          rank,
          score,
          reason: v.reason ?? null,
          concerns: v.concerns ?? null,
          model: process.env.GEMINI_MODEL || "gemini-2.5-flash-lite",
        });
      } catch (e) {
        errors++;
        toInsert.push({
          job_id: job.id,
          candidate_id: cand.id,
          rank: "×" as Rank,
          score: 0,
          reason: `evaluation failed: ${(e as Error).message.slice(0, 200)}`,
        });
      }
    }
  }

  if (toInsert.length) {
    await sbInsert("matches", toInsert, { onConflict: "job_id,candidate_id", returning: false });
  }

  await sbInsert("crawl_runs", [{
    kind: "match",
    status: "ok",
    stats: { jobs: jobs.length, candidates: candidates.length, new: toInsert.length, errors },
    started_at: runStart,
    finished_at: new Date().toISOString(),
  }], { returning: false });

  return Response.json({ ok: true, stats: { jobs: jobs.length, candidates: candidates.length, new: toInsert.length, errors } });
}
