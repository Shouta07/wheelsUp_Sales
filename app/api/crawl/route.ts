import { requireSecret, sbInsert, sbSelect, sbUpdate, supabaseConfigured } from "@/lib/supabase";
import { fetchPageText, sha256Hex } from "@/lib/scrape";
import { geminiJSON, geminiConfigured } from "@/lib/gemini";
import type { Company, Job } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

interface ExtractedJob {
  title: string;
  url?: string | null;
  employment_type?: string | null;
  location?: string | null;
  salary_min_jpy?: number | null;
  salary_max_jpy?: number | null;
  description?: string | null;
  requirements?: string | null;
  preferred?: string | null;
}

function buildPrompt(companyName: string, page: string): string {
  const snippet = page.slice(0, 12000);
  return `あなたは求人情報の構造化アシスタントです。
以下は「${companyName}」の採用ページから取得したテキストです。
建築設備・FM・PM・施設管理に関連する求人のみを抽出し、JSON 配列で返してください。
スキーマ: {title, url, employment_type, location, salary_min_jpy, salary_max_jpy, description, requirements, preferred}
salary は数値（円, 年収）。不明な値は null。配列以外は出力しない。

--- ページテキスト ---
${snippet}`;
}

async function crawlOne(company: Company): Promise<{ jobs: number; new: number; updated: number; closed: number; error?: string }> {
  if (!company.recruit_page_url) return { jobs: 0, new: 0, updated: 0, closed: 0, error: "no recruit_page_url" };
  const text = await fetchPageText(company.recruit_page_url);
  if (!text || text.length < 100) return { jobs: 0, new: 0, updated: 0, closed: 0, error: "empty page" };

  let extracted: ExtractedJob[] = [];
  try {
    const result = await geminiJSON<ExtractedJob[] | { jobs: ExtractedJob[] }>(buildPrompt(company.name, text));
    extracted = Array.isArray(result) ? result : result.jobs ?? [];
  } catch (e) {
    return { jobs: 0, new: 0, updated: 0, closed: 0, error: (e as Error).message };
  }

  const existing = await sbSelect<Job>("jobs", `select=id,content_hash,is_open&company_id=eq.${company.id}`);
  const existingByHash = new Map(existing.map((j) => [j.content_hash, j]));

  const rows: Record<string, unknown>[] = [];
  const seenHashes = new Set<string>();
  for (const j of extracted) {
    if (!j.title) continue;
    const hash = await sha256Hex(`${j.title}|${j.location ?? ""}|${j.employment_type ?? ""}|${j.description ?? ""}`);
    seenHashes.add(hash);
    rows.push({
      company_id: company.id,
      title: j.title,
      url: j.url ?? company.recruit_page_url,
      employment_type: j.employment_type ?? null,
      location: j.location ?? null,
      salary_min_jpy: j.salary_min_jpy ?? null,
      salary_max_jpy: j.salary_max_jpy ?? null,
      description: j.description ?? null,
      requirements: j.requirements ?? null,
      preferred: j.preferred ?? null,
      raw_snippet: text.slice(0, 2000),
      content_hash: hash,
      is_open: true,
      last_seen_at: new Date().toISOString(),
    });
  }

  let isNew = 0;
  let updated = 0;
  if (rows.length) {
    await sbInsert("jobs", rows, { onConflict: "company_id,content_hash", returning: false });
    for (const h of seenHashes) (existingByHash.has(h) ? updated++ : isNew++);
  }

  // Close anything not seen this run.
  let closed = 0;
  for (const e of existing) {
    if (!seenHashes.has(e.content_hash) && e.is_open) {
      await sbUpdate("jobs", { is_open: false }, `id=eq.${e.id}`);
      closed++;
    }
  }

  return { jobs: rows.length, new: isNew, updated, closed };
}

export async function POST(req: Request) {
  const unauth = requireSecret(req);
  if (unauth) return unauth;
  if (!supabaseConfigured) return Response.json({ error: "Supabase not configured" }, { status: 400 });
  if (!geminiConfigured) return Response.json({ error: "GEMINI_API_KEY not set" }, { status: 400 });

  const url = new URL(req.url);
  const limit = Number(url.searchParams.get("limit") ?? "20");
  const companyId = url.searchParams.get("company_id");

  const filter = companyId
    ? `select=*&id=eq.${companyId}`
    : `select=*&status=eq.active&recruit_page_url=not.is.null&order=priority.desc&limit=${limit}`;
  const companies = await sbSelect<Company>("companies", filter);

  const runStart = new Date().toISOString();
  const results: Record<string, unknown>[] = [];
  let totalNew = 0;
  let totalUpdated = 0;
  let totalClosed = 0;
  let errors = 0;
  for (const c of companies) {
    try {
      const r = await crawlOne(c);
      if (r.error) errors++;
      totalNew += r.new;
      totalUpdated += r.updated;
      totalClosed += r.closed;
      results.push({ company: c.name, ...r });
    } catch (e) {
      errors++;
      results.push({ company: c.name, error: (e as Error).message });
    }
  }

  await sbInsert("crawl_runs", [{
    kind: "crawl",
    status: errors ? "ok" : "ok",
    stats: { companies: companies.length, new: totalNew, updated: totalUpdated, closed: totalClosed, errors },
    started_at: runStart,
    finished_at: new Date().toISOString(),
  }], { returning: false });

  return Response.json({ ok: true, stats: { companies: companies.length, new: totalNew, updated: totalUpdated, closed: totalClosed, errors }, results });
}
