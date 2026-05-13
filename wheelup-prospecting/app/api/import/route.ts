import { readFile } from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";

import { requireSecret } from "@/lib/auth";
import { parseCsv } from "@/lib/csv";
import { isLive, sb } from "@/lib/supabase";
import type { CandidateProfile, Priority } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const denied = requireSecret(req);
  if (denied) return denied;
  if (!isLive) {
    return NextResponse.json({
      ok: false,
      error: "Supabase not configured — running in mock mode",
    }, { status: 412 });
  }

  const dataDir = path.join(process.cwd(), "data");
  const csv = await readFile(path.join(dataDir, "companies_seed.csv"), "utf8");
  const companyRows = parseCsv(csv);

  const companyPayload = companyRows.map((r) => ({
    name: r.name,
    category: r.category || null,
    priority: ((r.priority || "B").toUpperCase() as Priority),
    recruit_page_url: r.recruit_page_url || null,
    corporate_url: r.corporate_url || null,
    location: r.location || null,
    employee_size: r.employee_size || null,
    notes: r.notes || null,
    source: "seed",
  }));

  const insertedCompanies = await sb.insert("companies", companyPayload, {
    onConflict: "name",
  });

  const candJson = await readFile(path.join(dataDir, "candidates_seed.json"), "utf8");
  const candRows = JSON.parse(candJson) as {
    code: string;
    name: string;
    headline?: string;
    profile: CandidateProfile;
  }[];

  const insertedCandidates = await sb.insert("candidates", candRows.map((c) => ({
    code: c.code,
    name: c.name,
    headline: c.headline ?? null,
    profile: c.profile,
  })), { onConflict: "code" });

  return NextResponse.json({
    ok: true,
    companies: (insertedCompanies as unknown[]).length,
    candidates: (insertedCandidates as unknown[]).length,
  });
}
