import { sbInsert, sbSelect, supabaseConfigured } from "@/lib/supabase";
import { geminiConfigured, geminiJSON } from "@/lib/gemini";
import { assertUuid, clampInt, pgEq, pgInUuids } from "@/lib/pg";
import { guardRequest, jsonWithId } from "@/lib/apiGuard";
import { LLM_LIMIT } from "@/lib/ratelimit";
import { log, publicError } from "@/lib/logger";
import type { Candidate, Job, Match, Rank } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

interface Verdict {
  rank: Rank;
  score: number;
  reason: string;
  concerns?: string;
}

const VALID_RANKS: ReadonlySet<Rank> = new Set<Rank>(["◎", "◯", "△", "×"]);

function normalizeRank(v: unknown): Rank {
  if (typeof v === "string" && VALID_RANKS.has(v as Rank)) return v as Rank;
  return "△";
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
  const guard = guardRequest(req, { route: "match", limit: LLM_LIMIT });
  if (guard.deny) return guard.deny;
  const { requestId } = guard;

  if (!supabaseConfigured) return jsonWithId({ error: "supabase_not_configured" }, requestId, { status: 400 });
  if (!geminiConfigured) return jsonWithId({ error: "gemini_not_configured" }, requestId, { status: 400 });

  const url = new URL(req.url);
  const limit = clampInt(url.searchParams.get("limit"), 50, 200);
  const jobIdRaw = url.searchParams.get("job_id");

  const candidates = await sbSelect<Candidate>("candidates", `select=*&${pgEq("is_active", true)}`);
  if (!candidates.length) return jsonWithId({ ok: true, stats: { matched: 0 }, note: "no candidates" }, requestId);

  let jobsQuery: string;
  if (jobIdRaw) {
    try {
      assertUuid(jobIdRaw, "job_id");
    } catch {
      return jsonWithId({ error: "invalid_job_id" }, requestId, { status: 400 });
    }
    jobsQuery = `select=*&${pgEq("id", jobIdRaw)}`;
  } else {
    jobsQuery = `select=*&${pgEq("is_open", true)}&order=last_seen_at.desc&limit=${limit}`;
  }
  const jobs = await sbSelect<Job>("jobs", jobsQuery);

  const jobIds = jobs.map((j) => j.id);
  let existing: Match[] = [];
  if (jobIds.length) {
    existing = await sbSelect<Match>(
      "matches",
      `select=job_id,candidate_id&${pgInUuids("job_id", jobIds)}`,
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
        const rank = normalizeRank(v.rank);
        const score = Math.max(0, Math.min(100, Math.round(Number(v.score) || 0)));
        toInsert.push({
          job_id: job.id,
          candidate_id: cand.id,
          rank,
          score,
          reason: typeof v.reason === "string" ? v.reason : null,
          concerns: typeof v.concerns === "string" ? v.concerns : null,
          model: process.env.GEMINI_MODEL || "gemini-2.5-flash-lite",
        });
      } catch (e) {
        errors++;
        log.error("match_eval_failed", { requestId, job_id: job.id, candidate_id: cand.id, err: publicError(e) });
        toInsert.push({
          job_id: job.id,
          candidate_id: cand.id,
          rank: "×" as Rank,
          score: 0,
          reason: "evaluation_failed",
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

  return jsonWithId({
    ok: true,
    stats: { jobs: jobs.length, candidates: candidates.length, new: toInsert.length, errors },
  }, requestId);
}
