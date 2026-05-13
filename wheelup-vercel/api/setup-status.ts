/**
 * /api/setup-status — production readiness diagnostic.
 *
 * 一目で「動くべきものが揃っているか」を返す。フロントの SetupStatusBar
 * から叩く。何もブロックしない（読み取り専用）。
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

type TableProbe = { ok: boolean; count: number | null; error: string | null };

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const env = {
    SUPABASE_URL: !!process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    GEMINI_API_KEY: !!process.env.GEMINI_API_KEY,
    CRON_SECRET: !!process.env.CRON_SECRET,
    LARK_OR_SLACK_WEBHOOK: !!(process.env.LARK_WEBHOOK_URL || process.env.SLACK_WEBHOOK_URL),
  };

  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return res.json({
      ready: false,
      env,
      tables: null,
      seed: null,
      message: "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY を Vercel の環境変数に設定してください",
    });
  }

  let rawUrl = (process.env.SUPABASE_URL ?? "").trim().replace(/^["']+|["']+$/g, "");
  if (!rawUrl.startsWith("http")) rawUrl = `https://${rawUrl}`;
  rawUrl = rawUrl.replace(/\/+$/, "");
  const db = createClient(rawUrl, (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim());

  const tableNames = [
    "meeting_transcripts",
    "candidates",
    "companies",
    "industry_categories",
    "qualifications",
    "ra_companies",
    "ra_candidates",
    "ra_jobs",
    "ra_matches",
    "ra_discovery_queue",
  ] as const;

  const tables: Record<string, TableProbe> = {};
  await Promise.all(
    tableNames.map(async (name) => {
      const { count, error } = await db.from(name).select("*", { count: "exact", head: true });
      tables[name] = {
        ok: !error,
        count: typeof count === "number" ? count : null,
        error: error?.message ?? null,
      };
    }),
  );

  const seed = {
    meetings_total: tables.meeting_transcripts?.count ?? 0,
    leader_meetings: 0,
    ra_companies: tables.ra_companies?.count ?? 0,
    ra_candidates: tables.ra_candidates?.count ?? 0,
    industry_categories: tables.industry_categories?.count ?? 0,
    qualifications: tables.qualifications?.count ?? 0,
  };
  const { count: leaderCount } = await db
    .from("meeting_transcripts")
    .select("*", { count: "exact", head: true })
    .eq("is_leader", true);
  seed.leader_meetings = leaderCount ?? 0;

  const schemaMissing = Object.entries(tables).filter(([, p]) => !p.ok).map(([n]) => n);
  const seedMissing: string[] = [];
  if (seed.leader_meetings === 0) seedMissing.push("face_seed");
  if (seed.ra_companies === 0) seedMissing.push("ra_seed");
  if (seed.industry_categories === 0) seedMissing.push("industry_seed");

  const ready =
    Object.values(env).slice(0, 3).every(Boolean) && // SUPABASE x2 + GEMINI
    schemaMissing.length === 0 &&
    seedMissing.length === 0;

  return res.json({
    ready,
    env,
    tables,
    seed,
    schemaMissing,
    seedMissing,
    message: ready
      ? "本番運用可能な状態です"
      : schemaMissing.length > 0
        ? `Supabase に未作成のテーブルがあります: ${schemaMissing.join(", ")}`
        : seedMissing.length > 0
          ? `初期データが未投入です: ${seedMissing.join(", ")}`
          : "環境変数が不足しています",
  });
}
