import fs from "node:fs";
import path from "node:path";
import { parseCSV, coerce } from "@/lib/csv";
import { sbInsert, supabaseConfigured } from "@/lib/supabase";
import { guardRequest, jsonWithId } from "@/lib/apiGuard";
import { WRITE_LIMIT } from "@/lib/ratelimit";
import { log, publicError } from "@/lib/logger";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const guard = await guardRequest(req, { route: "import", limit: WRITE_LIMIT });
  if (guard.deny) return guard.deny;
  const { requestId } = guard;

  if (!supabaseConfigured) {
    return jsonWithId({ error: "supabase_not_configured" }, requestId, { status: 400 });
  }

  try {
    const dir = path.join(process.cwd(), "data");
    const csvText = fs.readFileSync(path.join(dir, "companies_seed.csv"), "utf-8");
    const candText = fs.readFileSync(path.join(dir, "candidates_seed.json"), "utf-8");

    const companies = parseCSV(csvText).map(coerce);
    const candidates = JSON.parse(candText) as Record<string, unknown>[];

    const stats = { companies: 0, candidates: 0 };

    if (companies.length) {
      const inserted = await sbInsert("companies", companies, { onConflict: "name" });
      stats.companies = (inserted as unknown[]).length;
    }

    if (candidates.length) {
      const inserted = await sbInsert("candidates", candidates, { onConflict: "code" });
      stats.candidates = (inserted as unknown[]).length;
    }

    return jsonWithId({ ok: true, stats }, requestId);
  } catch (e) {
    log.error("import_failed", { requestId, err: publicError(e) });
    return jsonWithId({ error: "import_failed" }, requestId, { status: 500 });
  }
}
