import { NextResponse } from "next/server";

import { requireSecret } from "@/lib/auth";
import { generateJson, geminiModel, hasGemini } from "@/lib/gemini";
import { isLive, sb } from "@/lib/supabase";
import type { Candidate, Grade, Job, Match } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Scored = { grade: Grade; score: number; reasons: string[]; concerns: string[] };

async function scoreOne(job: Job, candidate: Candidate): Promise<Scored> {
  if (!hasGemini) return { grade: "△", score: 50, reasons: ["mock"], concerns: ["GEMINI_API_KEY未設定"] };
  const prompt = `あなたは建築設備 / FM / PM / 施設管理 領域に特化した日本のRA（リクルーティング・アドバイザー）です。以下の求人 × 候補者の相性を ◎ ○ △ × で判定し、0-100点を付けてください。

# 候補者
名前: ${candidate.name}
ヘッドライン: ${candidate.headline ?? ""}
プロフィール(JSON):
${JSON.stringify(candidate.profile, null, 2)}

# 求人
会社: (社外秘・略)
タイトル: ${job.title}
雇用形態: ${job.employment_type ?? ""}
勤務地: ${job.location ?? ""}
想定年収: ${job.salary_range ?? ""}
説明: ${job.description ?? ""}
必須要件: ${job.requirements ?? ""}

# 判定基準
- ◎ = ほぼ確実にマッチ。本人の specialties と一致し、industries_ok の業界、deal_breakers に抵触しない。
- ○ = 強くマッチ。多少のズレはあるが推せる。
- △ = 接戦。打診の価値はあるが本人都合次第。
- × = 不適合。deal_breakers 抵触 or specialties と方向違い。

# 出力(JSON, それ以外は禁止)
{
  "grade": "◎ | ○ | △ | ×",
  "score": 0-100,
  "reasons": ["...", "..."],
  "concerns": ["...", "..."]
}`;
  const parsed = await generateJson<Scored>(prompt);
  const g = (parsed.grade ?? "△") as Grade;
  return {
    grade: ["◎", "○", "△", "×"].includes(g) ? g : "△",
    score: Math.max(0, Math.min(100, Number(parsed.score) || 0)),
    reasons: Array.isArray(parsed.reasons) ? parsed.reasons.slice(0, 6) : [],
    concerns: Array.isArray(parsed.concerns) ? parsed.concerns.slice(0, 6) : [],
  };
}

export async function POST(req: Request) {
  const denied = requireSecret(req);
  if (denied) return denied;
  if (!isLive) {
    return NextResponse.json({ ok: false, error: "supabase not configured" }, { status: 412 });
  }

  const url = new URL(req.url);
  const limit = Number(url.searchParams.get("limit") || "20");
  const jobId = url.searchParams.get("job_id");

  const candidates = await sb.select<Candidate>("candidates", {
    select: "*",
    is_active: "eq.true",
    limit: 20,
  });

  const jobs = jobId
    ? await sb.select<Job>("jobs", { select: "*", id: `eq.${jobId}`, limit: 1 })
    : await sb.select<Job>("jobs", {
        select: "*",
        is_open: "eq.true",
        order: "last_seen_at.desc",
        limit,
      });

  const stats = { scored: 0, skipped: 0, errors: 0 };
  const errors: string[] = [];

  for (const j of jobs) {
    for (const c of candidates) {
      try {
        const existing = await sb.select<Match>("matches", {
          select: "id",
          job_id: `eq.${j.id}`,
          candidate_id: `eq.${c.id}`,
          limit: 1,
        });
        if (existing.length > 0) {
          stats.skipped += 1;
          continue;
        }
        const s = await scoreOne(j, c);
        await sb.insert("matches", {
          job_id: j.id,
          candidate_id: c.id,
          grade: s.grade,
          score: s.score,
          reasons: s.reasons,
          concerns: s.concerns,
          model: geminiModel,
        }, { onConflict: "job_id,candidate_id" });
        stats.scored += 1;
      } catch (err) {
        stats.errors += 1;
        errors.push(`${j.title} × ${c.name}: ${(err as Error).message}`);
      }
    }
  }

  await sb.insert("crawl_runs", {
    kind: "match",
    finished_at: new Date().toISOString(),
    ok: stats.errors === 0,
    stats: { ...stats, jobs: jobs.length, candidates: candidates.length, model: geminiModel },
    error: errors.join(" | ") || null,
  });

  return NextResponse.json({ ok: true, ...stats, errors });
}
