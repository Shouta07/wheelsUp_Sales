import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getSupabaseAdmin } from "../../_lib/supabase-admin.js";
import OpenAI from "openai";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const db = getSupabaseAdmin();
  const id = req.query.id as string;

  // 候補者取得
  const { data: candidate, error } = await db.from("candidates").select("*").eq("id", id).single();
  if (error || !candidate) return res.status(404).json({ error: "候補者が見つかりません" });

  // キーワードマッチ — 候補者の希望条件で企業を検索
  const desiredKws: string[] = candidate.desired_keywords || [];
  let matched: Array<Record<string, unknown>> = [];

  if (desiredKws.length > 0) {
    const { data: companies } = await db.from("companies").select("*");
    if (companies) {
      for (const c of companies) {
        const companyKws: string[] = (c.keywords || []).map((k: string) => k.toLowerCase());
        const hits = desiredKws.filter((kw) =>
          companyKws.some((ck) => ck.includes(kw.toLowerCase())),
        );
        if (hits.length > 0) {
          const pitchLines: string[] = [];
          for (const kw of hits) {
            for (const [origKw, point] of Object.entries(c.pitch_points || {})) {
              if ((origKw as string).toLowerCase().includes(kw.toLowerCase())) {
                pitchLines.push(`${origKw}: ${point}`);
                break;
              }
            }
          }
          matched.push({
            company_id: c.id,
            name: c.name,
            score: hits.length,
            matched_keywords: hits,
            pitch_lines: pitchLines,
            address: c.address || "",
          });
        }
      }
      matched.sort((a, b) => (b.score as number) - (a.score as number));
      matched = matched.slice(0, 10);
    }
  }

  // プロフィール構築
  const profile = `名前: ${candidate.name}
年齢: ${candidate.age || "不明"}歳
現職企業: ${candidate.current_company || "不明"}
現職ポジション: ${candidate.current_position || "不明"}
業界: ${candidate.current_industry || "不明"}
経験年数: ${candidate.years_of_experience || "不明"}年
現在年収: ${candidate.current_salary || "不明"}万円
保有資格: ${(candidate.qualifications || []).join(", ") || "なし"}
希望条件: ${desiredKws.join(", ") || "未設定"}
希望年収: ${candidate.desired_salary || "不明"}万円
希望勤務地: ${candidate.desired_location || "不明"}
希望ポジション: ${candidate.desired_position || "不明"}`;

  let companiesText = "";
  if (matched.length > 0) {
    companiesText = "\n\n【マッチ企業候補】\n";
    matched.slice(0, 5).forEach((m, i) => {
      companiesText += `\n${i + 1}. ${m.name}（マッチ度: ${m.score}）`;
      if ((m.pitch_lines as string[]).length > 0) {
        for (const pl of m.pitch_lines as string[]) {
          companiesText += `\n   - ${pl}`;
        }
      }
    });
  }

  const prompt = `あなたは wheelsUp 社のキャリアコンサルティングAIアシスタントです。
施設管理・建設マネジメント業界の人材紹介を行っています。

以下の候補者について面談前ブリーフィングを作成してください。

【候補者プロフィール】
${profile}
${companiesText}

以下の6項目をマークダウン形式で出力してください：

## 1. 現職企業分析
## 2. 推定ニーズ（転職動機の仮説）
## 3. 訴求すべきポイント
## 4. 紹介企業候補（上位3-5社）
## 5. 面談トークスクリプト
## 6. リスク・注意点`;

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content: prompt }],
    max_tokens: 3000,
  });
  const briefing = completion.choices[0].message.content;

  // 推定ニーズ構造化
  const needsPrompt = `以下の候補者プロフィールから、JSON形式で推定ニーズを出力してください。
キーは: likely_pain_points (array), motivation (string), risk_factors (array), recommended_approach (string)

${profile}

JSON のみ出力（説明不要）:`;

  const needsCompletion = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content: needsPrompt }],
    max_tokens: 500,
  });

  let inferredNeeds: Record<string, unknown> = {};
  try {
    let raw = needsCompletion.choices[0].message.content || "";
    if (raw.startsWith("```")) {
      raw = raw.split("\n").slice(1).join("\n").replace(/```$/, "");
    }
    inferredNeeds = JSON.parse(raw);
  } catch {
    inferredNeeds = { raw: needsCompletion.choices[0].message.content };
  }

  // DB に保存
  await db
    .from("candidates")
    .update({
      inferred_needs: inferredNeeds,
      matched_companies: matched.slice(0, 5),
    })
    .eq("id", id);

  return res.json({
    candidate_id: id,
    briefing,
    matched_companies: matched,
    inferred_needs: inferredNeeds,
  });
}
