import { NextResponse } from "next/server";

import { requireSecret } from "@/lib/auth";
import { generateJson, geminiModel, hasGemini } from "@/lib/gemini";
import { isLive, sb } from "@/lib/supabase";
import type { Company } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Suggestion = {
  name: string;
  reason?: string;
  hint_url?: string;
  category?: string;
};

export async function POST(req: Request) {
  const denied = requireSecret(req);
  if (denied) return denied;
  if (!isLive) {
    return NextResponse.json({ ok: false, error: "supabase not configured" }, { status: 412 });
  }
  if (!hasGemini) {
    return NextResponse.json({ ok: false, error: "GEMINI_API_KEY not configured" }, { status: 412 });
  }

  const url = new URL(req.url);
  const want = Number(url.searchParams.get("count") || "10");

  const known = await sb.select<Company>("companies", { select: "name,category", limit: 1000 });
  const knownNames = known.map((c) => c.name).slice(0, 246);

  const prompt = `あなたは日本の建築設備 / FM / PM / 施設管理 / ゼネコン業界に詳しいリサーチャーです。
既に下記の企業はターゲットリストに入っています:
${knownNames.join(", ")}

これら**以外**で、同じ領域（特に大規模施設・商業施設・物流施設・データセンター・病院・空港・工場 のFM/PM、ビル設備管理、サブコン、設備工事会社、ゼネコン施工管理）の有力な日本企業を ${want} 社、新規に提案してください。

出力(JSON のみ):
{
  "suggestions": [
    {
      "name": "正式社名",
      "category": "FM | PM | 建築設備 | 施設管理 | ゼネコン | サブコン | その他",
      "reason": "なぜターゲットに加えるべきか(1-2文)",
      "hint_url": "コーポレートまたは採用ページ URL(分かれば)"
    }
  ]
}`;

  const parsed = await generateJson<{ suggestions: Suggestion[] }>(prompt, { temperature: 0.4 });
  const suggestions = Array.isArray(parsed?.suggestions) ? parsed.suggestions : [];

  const existing = new Set(knownNames);
  const toInsert = suggestions
    .filter((s) => s.name && !existing.has(s.name))
    .map((s) => ({
      name: s.name,
      reason: s.reason ?? null,
      hint_url: s.hint_url ?? null,
      category: s.category ?? null,
      status: "pending",
      raw: s,
    }));

  if (toInsert.length > 0) {
    await sb.insert("discovery_queue", toInsert);
  }
  await sb.insert("crawl_runs", {
    kind: "discover",
    finished_at: new Date().toISOString(),
    ok: true,
    stats: { suggested: suggestions.length, queued: toInsert.length, model: geminiModel },
  });

  return NextResponse.json({ ok: true, suggested: suggestions.length, queued: toInsert.length });
}
