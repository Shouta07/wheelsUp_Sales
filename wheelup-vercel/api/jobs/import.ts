import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getSupabaseAdmin } from "../_lib/supabase-admin.js";

/**
 * CSV インポート API
 * POST /api/jobs/import
 * Body: { rows: Array<Record<string, string>> }
 *
 * フロントエンドで CSV をパースし、JSON 配列として送信する。
 * external_id がある場合は既存行を更新（upsert）。
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const db = getSupabaseAdmin();
  const { rows } = req.body;

  if (!Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ error: "rows 配列が必要です" });
  }

  // CSV ヘッダ名 → DB カラム名のマッピング
  const headerMap: Record<string, string> = {
    "求人タイトル": "title",
    "タイトル": "title",
    title: "title",
    "企業名": "_company_name",
    company_name: "_company_name",
    "職種": "position_type",
    position_type: "position_type",
    "業界カテゴリ": "industry_category_slug",
    industry_category_slug: "industry_category_slug",
    "雇用形態": "employment_type",
    employment_type: "employment_type",
    "年収下限": "salary_min",
    salary_min: "salary_min",
    "年収上限": "salary_max",
    salary_max: "salary_max",
    "勤務地": "location",
    location: "location",
    "仕事内容": "description",
    description: "description",
    "必須条件": "requirements",
    requirements: "requirements",
    "歓迎条件": "preferred",
    preferred: "preferred",
    "必要資格": "required_qualifications",
    required_qualifications: "required_qualifications",
    "福利厚生": "benefits",
    benefits: "benefits",
    "キーワード": "keywords",
    keywords: "keywords",
    "ステータス": "status",
    status: "status",
    "外部ID": "external_id",
    external_id: "external_id",
    "備考": "notes",
    notes: "notes",
  };

  // 企業名 → ID の解決用キャッシュ
  const { data: companies } = await db.from("companies").select("id, name");
  const companyMap = new Map<string, string>();
  for (const c of companies || []) {
    companyMap.set((c.name as string).toLowerCase(), c.id as string);
  }

  const arrayFields = new Set(["requirements", "preferred", "required_qualifications", "keywords"]);
  const intFields = new Set(["salary_min", "salary_max"]);

  let created = 0;
  let updated = 0;
  const errors: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    const raw = rows[i];
    const mapped: Record<string, unknown> = {};
    let companyName = "";

    for (const [key, val] of Object.entries(raw)) {
      const col = headerMap[key.trim()];
      if (!col) continue;
      const v = typeof val === "string" ? val.trim() : val;
      if (!v) continue;

      if (col === "_company_name") {
        companyName = v as string;
        continue;
      }

      if (arrayFields.has(col)) {
        mapped[col] = (v as string).split(/[,、;；]/).map((s: string) => s.trim()).filter(Boolean);
      } else if (intFields.has(col)) {
        const n = parseInt(v as string, 10);
        if (!isNaN(n)) mapped[col] = n;
      } else {
        mapped[col] = v;
      }
    }

    if (!mapped.title) {
      errors.push(`行${i + 1}: タイトルが空です`);
      continue;
    }

    // 企業名マッチ
    if (companyName) {
      const cid = companyMap.get(companyName.toLowerCase());
      if (cid) mapped.company_id = cid;
    }

    mapped.source = "spreadsheet";

    // external_id による upsert
    if (mapped.external_id) {
      const { data: existing } = await db
        .from("job_postings")
        .select("id")
        .eq("external_id", mapped.external_id)
        .maybeSingle();

      if (existing) {
        await db.from("job_postings").update(mapped).eq("id", existing.id);
        updated++;
        continue;
      }
    }

    const { error } = await db.from("job_postings").insert(mapped);
    if (error) {
      errors.push(`行${i + 1}: ${error.message}`);
    } else {
      created++;
    }
  }

  return res.json({ created, updated, errors, total: rows.length });
}
