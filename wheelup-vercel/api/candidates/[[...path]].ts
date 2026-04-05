import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getSupabaseAdmin } from "../_lib/supabase-admin.js";
import OpenAI from "openai";

/**
 * 統合 Candidates API（Vercel Hobby プラン対応: 1 Function）
 *
 * GET    /api/candidates              → 一覧
 * POST   /api/candidates              → 新規作成
 * GET    /api/candidates/:id          → 詳細
 * PUT    /api/candidates/:id          → 更新
 * POST   /api/candidates/:id/briefing → AI ブリーフィング
 * POST   /api/candidates/:id/meeting-notes → 面談メモ保存
 * POST   /api/candidates/:id/action   → アクション追加
 * PUT    /api/candidates/:id/follow-up → フォロー設定
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const db = getSupabaseAdmin();
  const segments: string[] = Array.isArray(req.query.path)
    ? req.query.path
    : req.query.path
      ? [req.query.path]
      : [];

  // --- /api/candidates/phase-progress ---
  if (segments[0] === "phase-progress") {
    if (req.method === "GET") return getPhaseProgress(db, req, res);
    if (req.method === "PUT") return savePhaseProgress(db, req, res);
    return res.status(405).json({ error: "Method not allowed" });
  }

  // --- /api/candidates ---
  if (segments.length === 0) {
    if (req.method === "GET") return listCandidates(db, req, res);
    if (req.method === "POST") return createCandidate(db, req, res);
    return res.status(405).json({ error: "Method not allowed" });
  }

  const id = segments[0];
  const sub = segments[1] || "";

  // --- /api/candidates/:id ---
  if (!sub) {
    if (req.method === "GET") {
      const { data, error } = await db.from("candidates").select("*").eq("id", id).single();
      if (error) return res.status(404).json({ error: "候補者が見つかりません" });
      return res.json(data);
    }
    if (req.method === "PUT") {
      const { data, error } = await db.from("candidates").update(req.body).eq("id", id).select().single();
      if (error) return res.status(500).json({ error: error.message });
      return res.json(data);
    }
    return res.status(405).json({ error: "Method not allowed" });
  }

  // --- /api/candidates/:id/briefing ---
  if (sub === "briefing" && req.method === "POST") return briefing(db, id, res);
  // --- /api/candidates/:id/meeting-notes ---
  if (sub === "meeting-notes" && req.method === "POST") return meetingNotes(db, id, req, res);
  // --- /api/candidates/:id/action ---
  if (sub === "action" && req.method === "POST") return addAction(db, id, req, res);
  // --- /api/candidates/:id/follow-up ---
  if (sub === "follow-up" && req.method === "PUT") return followUp(db, id, req, res);

  return res.status(404).json({ error: "Not found" });
}

/* ---------- helpers ---------- */

async function listCandidates(db: ReturnType<typeof getSupabaseAdmin>, req: VercelRequest, res: VercelResponse) {
  const { status, q, follow_up_due } = req.query;
  let query = db.from("candidates").select("*").order("updated_at", { ascending: false });
  if (status && typeof status === "string") query = query.eq("status", status);
  if (q && typeof q === "string") query = query.or(`name.ilike.%${q}%,current_company.ilike.%${q}%`);
  if (follow_up_due === "true") {
    query = query.lte("follow_up_date", new Date().toISOString()).not("status", "in", '("placed","lost")');
  }
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  const now = Date.now();
  const candidates = (data || []).map((c: Record<string, unknown>) => ({
    ...c,
    days_since_contact: c.last_contact_date
      ? Math.floor((now - new Date(c.last_contact_date as string).getTime()) / 86400000)
      : 0,
  }));
  return res.json({ candidates, total: candidates.length });
}

async function createCandidate(db: ReturnType<typeof getSupabaseAdmin>, req: VercelRequest, res: VercelResponse) {
  const { data, error } = await db.from("candidates").insert(req.body).select().single();
  if (error) return res.status(500).json({ error: error.message });
  return res.json(data);
}

async function briefing(db: ReturnType<typeof getSupabaseAdmin>, id: string, res: VercelResponse) {
  const { data: candidate, error } = await db.from("candidates").select("*").eq("id", id).single();
  if (error || !candidate) return res.status(404).json({ error: "候補者が見つかりません" });

  const desiredKws: string[] = candidate.desired_keywords || [];
  let matched: Array<Record<string, unknown>> = [];

  if (desiredKws.length > 0) {
    const { data: companies } = await db.from("companies").select("*");
    if (companies) {
      for (const c of companies) {
        const companyKws: string[] = (c.keywords || []).map((k: string) => k.toLowerCase());
        const hits = desiredKws.filter((kw) => companyKws.some((ck) => ck.includes(kw.toLowerCase())));
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
          matched.push({ company_id: c.id, name: c.name, score: hits.length, matched_keywords: hits, pitch_lines: pitchLines, address: c.address || "" });
        }
      }
      matched.sort((a, b) => (b.score as number) - (a.score as number));
      matched = matched.slice(0, 10);
    }
  }

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
      for (const pl of m.pitch_lines as string[]) companiesText += `\n   - ${pl}`;
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
  const briefingText = completion.choices[0].message.content;

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
    if (raw.startsWith("```")) raw = raw.split("\n").slice(1).join("\n").replace(/```$/, "");
    inferredNeeds = JSON.parse(raw);
  } catch {
    inferredNeeds = { raw: needsCompletion.choices[0].message.content };
  }

  await db.from("candidates").update({ inferred_needs: inferredNeeds, matched_companies: matched.slice(0, 5) }).eq("id", id);

  return res.json({ candidate_id: id, briefing: briefingText, matched_companies: matched, inferred_needs: inferredNeeds });
}

async function meetingNotes(db: ReturnType<typeof getSupabaseAdmin>, id: string, req: VercelRequest, res: VercelResponse) {
  const { notes, keywords_discovered } = req.body;
  const { data: c, error } = await db.from("candidates").select("*").eq("id", id).single();
  if (error || !c) return res.status(404).json({ error: "候補者が見つかりません" });

  const newKws = [...new Set([...(c.desired_keywords || []), ...(keywords_discovered || [])])];
  const history = c.action_history || [];
  history.push({ date: new Date().toISOString().split("T")[0], action: "面談実施", result: `メモ ${(notes || "").length}文字記録` });

  const { data, error: ue } = await db
    .from("candidates")
    .update({ meeting_notes: notes, desired_keywords: newKws, last_contact_date: new Date().toISOString(), status: "in_progress", action_history: history })
    .eq("id", id).select().single();
  if (ue) return res.status(500).json({ error: ue.message });
  return res.json(data);
}

async function addAction(db: ReturnType<typeof getSupabaseAdmin>, id: string, req: VercelRequest, res: VercelResponse) {
  const { action, result } = req.body;
  const { data: c, error } = await db.from("candidates").select("*").eq("id", id).single();
  if (error || !c) return res.status(404).json({ error: "候補者が見つかりません" });

  const history = c.action_history || [];
  history.push({ date: new Date().toISOString().split("T")[0], action, result: result || "" });

  const { data, error: ue } = await db
    .from("candidates")
    .update({ action_history: history, last_contact_date: new Date().toISOString() })
    .eq("id", id).select().single();
  if (ue) return res.status(500).json({ error: ue.message });
  return res.json(data);
}

async function getPhaseProgress(db: ReturnType<typeof getSupabaseAdmin>, req: VercelRequest, res: VercelResponse) {
  const { entity_type, entity_id, phase } = req.query;
  if (!entity_type || !entity_id) return res.status(400).json({ error: "entity_type and entity_id are required" });
  let query = db.from("phase_progress").select("*")
    .eq("entity_type", entity_type as string)
    .eq("entity_id", entity_id as string);
  if (phase) query = query.eq("phase", Number(phase));
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ progress: data || [] });
}

async function savePhaseProgress(db: ReturnType<typeof getSupabaseAdmin>, req: VercelRequest, res: VercelResponse) {
  const { entity_type, entity_id, phase, checked_items, notes } = req.body;
  if (!entity_type || !entity_id || !phase) return res.status(400).json({ error: "entity_type, entity_id, phase required" });
  const { data, error } = await db.from("phase_progress")
    .upsert({ entity_type, entity_id, phase, checked_items: checked_items || [], notes: notes || null }, { onConflict: "entity_type,entity_id,phase" })
    .select().single();
  if (error) return res.status(500).json({ error: error.message });
  return res.json(data);
}

async function followUp(db: ReturnType<typeof getSupabaseAdmin>, id: string, req: VercelRequest, res: VercelResponse) {
  const updates: Record<string, unknown> = {};
  if (req.body.status) updates.status = req.body.status;
  if (req.body.follow_up_date) updates.follow_up_date = req.body.follow_up_date;
  if (req.body.follow_up_priority) updates.follow_up_priority = req.body.follow_up_priority;
  if (req.body.follow_up_notes !== undefined) updates.follow_up_notes = req.body.follow_up_notes;

  const { data, error } = await db.from("candidates").update(updates).eq("id", id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  return res.json(data);
}
