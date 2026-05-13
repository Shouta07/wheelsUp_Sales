import fs from "node:fs";
import path from "node:path";
import { parseCSV, coerce } from "@/lib/csv";
import { requireSecret, sbInsert, supabaseConfigured } from "@/lib/supabase";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const unauth = requireSecret(req);
  if (unauth) return unauth;
  if (!supabaseConfigured) {
    return Response.json({ error: "Supabase not configured" }, { status: 400 });
  }

  const dir = path.join(process.cwd(), "data");
  const csvText = fs.readFileSync(path.join(dir, "companies_seed.csv"), "utf-8");
  const candText = fs.readFileSync(path.join(dir, "candidates_seed.json"), "utf-8");

  const companies = parseCSV(csvText).map(coerce);
  const candidates = JSON.parse(candText) as Record<string, unknown>[];

  const stats = { companies: 0, candidates: 0 };

  // companies: upsert on name
  if (companies.length) {
    const inserted = await sbInsert("companies", companies, {
      onConflict: "name",
    });
    stats.companies = (inserted as unknown[]).length;
  }

  // candidates: upsert on code
  if (candidates.length) {
    const inserted = await sbInsert("candidates", candidates, {
      onConflict: "code",
    });
    stats.candidates = (inserted as unknown[]).length;
  }

  return Response.json({ ok: true, stats });
}
