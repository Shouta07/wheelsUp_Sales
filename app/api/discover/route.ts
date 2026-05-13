import { requireSecret, sbInsert, sbSelect, supabaseConfigured } from "@/lib/supabase";
import { geminiConfigured, geminiJSON } from "@/lib/gemini";
import type { Company } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

interface Suggestion {
  name: string;
  homepage_url?: string | null;
  category_hint?: string | null;
  reason?: string | null;
}

export async function POST(req: Request) {
  const unauth = requireSecret(req);
  if (unauth) return unauth;
  if (!supabaseConfigured) return Response.json({ error: "Supabase not configured" }, { status: 400 });
  if (!geminiConfigured) return Response.json({ error: "GEMINI_API_KEY not set" }, { status: 400 });

  const url = new URL(req.url);
  const want = Number(url.searchParams.get("count") ?? "20");

  const sample = await sbSelect<Company>(
    "companies",
    "select=name,category&priority=gte.4&limit=40"
  );
  const knownNames = new Set(sample.map((c) => c.name));
  const knownList = sample.map((c) => `- ${c.name}（${c.category ?? ""}）`).join("\n");

  const prompt = `あなたは法人開拓のリサーチャーです。RA（人材紹介）の開拓対象として、
建築設備工事・FM（ファシリティマネジメント）・PM（プロパティマネジメント）・施設管理・関連メーカー
の領域で、関東圏（東京・神奈川・千葉・埼玉）の中堅以上の日本企業を ${want} 社提案してください。

既知の優先企業（重複させない）:
${knownList || "(空)"}

要件:
- 日本実在の中堅〜大手で、求人が継続的に出ていそうな企業を優先
- 上場・非上場を問わない
- HPが取得しやすい企業を優先
- name は正式名称、homepage_url は推定でOK（後で人手レビュー）

JSON 配列のみ。各要素: {"name":"…","homepage_url":"https://…","category_hint":"FM","reason":"理由を1〜2文"}`;

  const result = await geminiJSON<Suggestion[] | { suggestions: Suggestion[] }>(prompt, { temperature: 0.5 });
  const items = Array.isArray(result) ? result : result.suggestions ?? [];

  const fresh = items
    .filter((it) => it.name && !knownNames.has(it.name))
    .slice(0, want)
    .map((it) => ({
      name: it.name,
      homepage_url: it.homepage_url ?? null,
      category_hint: it.category_hint ?? null,
      reason: it.reason ?? null,
      source: "gemini",
      status: "pending",
    }));

  if (fresh.length) {
    await sbInsert("discovery_queue", fresh, { returning: false });
  }

  await sbInsert("crawl_runs", [{
    kind: "discover",
    status: "ok",
    stats: { suggested: items.length, queued: fresh.length },
    finished_at: new Date().toISOString(),
  }], { returning: false });

  return Response.json({ ok: true, stats: { suggested: items.length, queued: fresh.length } });
}
