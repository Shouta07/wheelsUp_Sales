import { NextResponse } from "next/server";

import { requireSecret } from "@/lib/auth";
import { generateJson, geminiModel, hasGemini } from "@/lib/gemini";
import { fetchPage, sha256 } from "@/lib/scrape";
import { isLive, sb } from "@/lib/supabase";
import type { Company, Job } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type ExtractedJob = {
  title: string;
  description?: string;
  requirements?: string;
  employment_type?: string;
  location?: string;
  salary_range?: string;
  url?: string;
};

async function extractJobs(companyName: string, body: string): Promise<ExtractedJob[]> {
  if (!hasGemini) return [];
  const trimmed = body.slice(0, 20000);
  const prompt = `You are reading the careers page of "${companyName}" (a Japanese firm in the FM / PM / 建築設備 / 施設管理 / ゼネコン space). Extract every currently-open job listing found in the text below.

Return STRICT JSON only, with this shape:
{
  "jobs": [
    {
      "title": "string",
      "description": "string (short, 1-3 sentences)",
      "requirements": "string (1-3 sentences, key musts)",
      "employment_type": "正社員 | 契約 | ... | null",
      "location": "string | null",
      "salary_range": "string | null",
      "url": "string | null (only if the page exposes a per-listing URL)"
    }
  ]
}

If you can't find any concrete openings (page is empty / generic), return {"jobs": []}.

--- PAGE TEXT ---
${trimmed}`;
  const parsed = await generateJson<{ jobs: ExtractedJob[] }>(prompt);
  return Array.isArray(parsed?.jobs) ? parsed.jobs : [];
}

export async function POST(req: Request) {
  const denied = requireSecret(req);
  if (denied) return denied;
  if (!isLive) {
    return NextResponse.json({ ok: false, error: "supabase not configured" }, { status: 412 });
  }

  const url = new URL(req.url);
  const limit = Number(url.searchParams.get("limit") || "10");
  const companyId = url.searchParams.get("company_id");

  const query: Record<string, string | number> = {
    select: "*",
    "recruit_page_url": "not.is.null",
    order: "last_crawled_at.asc.nullsfirst",
    limit,
  };
  if (companyId) query.id = `eq.${companyId}`;
  const companies = await sb.select<Company>("companies", query);

  const stats = { crawled: 0, newJobs: 0, updatedJobs: 0, errors: 0 as number };
  const errors: string[] = [];

  for (const c of companies) {
    if (!c.recruit_page_url) continue;
    try {
      const body = await fetchPage(c.recruit_page_url);
      const extracted = await extractJobs(c.name, body);
      for (const j of extracted) {
        const hashSource = `${j.title}\n${j.description ?? ""}\n${j.requirements ?? ""}`;
        const content_hash = await sha256(hashSource);
        const existing = await sb.select<Job>("jobs", {
          select: "id",
          company_id: `eq.${c.id}`,
          content_hash: `eq.${content_hash}`,
          limit: 1,
        });
        if (existing.length === 0) {
          await sb.insert("jobs", {
            company_id: c.id,
            title: j.title,
            description: j.description ?? null,
            requirements: j.requirements ?? null,
            employment_type: j.employment_type ?? null,
            location: j.location ?? null,
            salary_range: j.salary_range ?? null,
            url: j.url ?? c.recruit_page_url,
            content_hash,
            is_open: true,
            raw: j,
          }, { onConflict: "company_id,content_hash" });
          stats.newJobs += 1;
        } else {
          await sb.update("jobs", { last_seen_at: new Date().toISOString(), is_open: true }, {
            id: `eq.${existing[0].id}`,
          });
          stats.updatedJobs += 1;
        }
      }
      await sb.update("companies", { last_crawled_at: new Date().toISOString() }, {
        id: `eq.${c.id}`,
      });
      stats.crawled += 1;
    } catch (err) {
      stats.errors += 1;
      errors.push(`${c.name}: ${(err as Error).message}`);
    }
  }

  await sb.insert("crawl_runs", {
    kind: "crawl",
    finished_at: new Date().toISOString(),
    ok: stats.errors === 0,
    stats: { ...stats, model: geminiModel },
    error: errors.join(" | ") || null,
  });

  return NextResponse.json({ ok: true, ...stats, errors });
}
