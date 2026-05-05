import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getSupabaseAdmin } from "../_lib/supabase-admin.js";

/**
 * 統合 Meetings API（Gemini 文字起こし + AI要約）
 *
 * POST   /api/meetings                → 議事録を直接テキスト保存
 * POST   /api/meetings/transcribe     → Gemini で文字起こし（base64 音声）
 * GET    /api/meetings                → 議事録一覧
 * GET    /api/meetings/:id            → 議事録詳細
 * POST   /api/meetings/:id/summarize  → AI 要約生成
 * POST   /api/meetings/:id/score     → 面談品質スコアリング
 * PUT    /api/meetings/:id            → 議事録更新
 * DELETE /api/meetings/:id            → 議事録削除
 * POST   /api/meetings/extract-playbook → リーダー面談からプレイブック抽出
 * POST   /api/meetings/coach          → 案件文脈付きフェーズ別コーチング
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const db = getSupabaseAdmin();
  const segments: string[] = Array.isArray(req.query.path)
    ? req.query.path
    : req.query.path ? [req.query.path] : [];

  try {
    // --- /api/meetings (root) ---
    if (segments.length === 0) {
      if (req.method === "GET") return await listTranscripts(db, req, res);
      if (req.method === "POST") return await createTranscript(db, req, res);
      return res.status(405).json({ error: "Method not allowed" });
    }

    // --- /api/meetings/transcribe ---
    if (segments[0] === "transcribe" && req.method === "POST") {
      return await transcribeWithGemini(db, req, res);
    }
    // --- /api/meetings/extract-playbook ---
    if (segments[0] === "extract-playbook" && req.method === "POST") {
      return await extractPlaybook(db, req, res);
    }
    // --- /api/meetings/coach ---
    if (segments[0] === "coach" && req.method === "POST") {
      return await contextualCoach(db, req, res);
    }

    // --- /api/meetings/:id ---
    const id = segments[0];
    const sub = segments[1] || "";

    if (!sub) {
      if (req.method === "GET") return await getTranscript(db, id, res);
      if (req.method === "PUT") return await updateTranscript(db, id, req, res);
      if (req.method === "DELETE") return await deleteTranscript(db, id, res);
    }

    // --- /api/meetings/:id/summarize ---
    if (sub === "summarize" && req.method === "POST") {
      return await summarize(db, id, res);
    }
    // --- /api/meetings/:id/score ---
    if (sub === "score" && req.method === "POST") {
      return await scoreMeeting(db, id, res);
    }

    return res.status(404).json({ error: "Not found" });
  } catch (e) {
    return res.status(500).json({ error: (e as Error).message });
  }
}

/* ========== CRUD ========== */

async function listTranscripts(db: ReturnType<typeof getSupabaseAdmin>, req: VercelRequest, res: VercelResponse) {
  const { deal_id, candidate_id, consultant_name, is_leader } = req.query;
  let query = db.from("meeting_transcripts").select("*").order("recorded_at", { ascending: false });
  if (deal_id && typeof deal_id === "string") query = query.eq("deal_id", deal_id);
  if (candidate_id && typeof candidate_id === "string") query = query.eq("candidate_id", candidate_id);
  if (consultant_name && typeof consultant_name === "string") query = query.eq("consultant_name", consultant_name);
  if (is_leader === "true") query = query.eq("is_leader", true);
  if (is_leader === "false") query = query.eq("is_leader", false);
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ transcripts: data || [], total: (data || []).length });
}

async function createTranscript(db: ReturnType<typeof getSupabaseAdmin>, req: VercelRequest, res: VercelResponse) {
  const b = req.body;
  const { data, error } = await db.from("meeting_transcripts").insert({
    deal_id: b.deal_id || null,
    candidate_id: b.candidate_id || null,
    consultant_name: b.consultant_name || null,
    is_leader: b.is_leader || false,
    title: b.title || "面談記録",
    transcript_text: b.transcript_text || "",
    summary: b.summary || null,
    action_items: b.action_items || [],
    key_points: b.key_points || [],
    next_steps: b.next_steps || null,
    attendees: b.attendees || [],
    duration_minutes: b.duration_minutes || null,
    source: b.source || "manual",
    recorded_at: b.recorded_at || new Date().toISOString(),
  }).select().single();
  if (error) return res.status(500).json({ error: error.message });

  // Auto-score if transcript has text content
  if (b.transcript_text && b.transcript_text.trim().length > 50) {
    scoreMeetingInternal(db, data.id).then((scoreResult) => {
      if (!("error" in scoreResult)) {
        console.log(`Auto-scored meeting ${data.id}: grade=${scoreResult.grade}`);
      }
    }).catch(() => {});
  }

  return res.status(201).json({ ...data, auto_scoring: !!(b.transcript_text && b.transcript_text.trim().length > 50) });
}

async function getTranscript(db: ReturnType<typeof getSupabaseAdmin>, id: string, res: VercelResponse) {
  const { data, error } = await db.from("meeting_transcripts").select("*").eq("id", id).single();
  if (error) return res.status(404).json({ error: "議事録が見つかりません" });
  return res.json(data);
}

async function updateTranscript(db: ReturnType<typeof getSupabaseAdmin>, id: string, req: VercelRequest, res: VercelResponse) {
  const b = req.body;
  const updates: Record<string, unknown> = {};
  const fields = ["title", "transcript_text", "summary", "action_items", "key_points", "next_steps", "attendees", "duration_minutes", "deal_id", "candidate_id"];
  for (const f of fields) { if (b[f] !== undefined) updates[f] = b[f]; }
  const { data, error } = await db.from("meeting_transcripts").update(updates).eq("id", id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  return res.json(data);
}

async function deleteTranscript(db: ReturnType<typeof getSupabaseAdmin>, id: string, res: VercelResponse) {
  const { error } = await db.from("meeting_transcripts").delete().eq("id", id);
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ deleted: true });
}

/* ========== Gemini Transcription ========== */

async function transcribeWithGemini(db: ReturnType<typeof getSupabaseAdmin>, req: VercelRequest, res: VercelResponse) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "GEMINI_API_KEY not set" });

  const { audio_base64, mime_type, deal_id, candidate_id, title, attendees, consultant_name, is_leader } = req.body;

  if (!audio_base64) {
    return res.status(400).json({ error: "audio_base64 が必要です" });
  }

  const mimeType = mime_type || "audio/webm";

  // Gemini API で文字起こし
  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

  const geminiRes = await fetch(geminiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{
        parts: [
          {
            inline_data: {
              mime_type: mimeType,
              data: audio_base64,
            },
          },
          {
            text: `この音声は人材紹介の面談録音です。以下の形式で文字起こしと分析を行ってください。

## 文字起こし
話者を区別しながら、会話内容を忠実に文字起こししてください。

## 要点
- 箇条書きで重要なポイントを5-10個

## アクションアイテム
- 具体的な次のアクションを箇条書き

## 候補者の本音・ニーズ
- 発言から読み取れる転職動機、不満、希望を分析`,
          },
        ],
      }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 8192,
      },
    }),
  });

  if (!geminiRes.ok) {
    const errText = await geminiRes.text();
    return res.status(500).json({ error: `Gemini API error: ${errText}` });
  }

  const geminiData = await geminiRes.json();
  const fullText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "";

  // セクション分割
  const sections = parseGeminiOutput(fullText);

  // DB保存
  const { data, error } = await db.from("meeting_transcripts").insert({
    deal_id: deal_id || null,
    candidate_id: candidate_id || null,
    consultant_name: consultant_name || null,
    is_leader: is_leader || false,
    title: title || "Gemini 文字起こし",
    transcript_text: sections.transcript,
    summary: sections.summary,
    action_items: sections.actionItems,
    key_points: sections.keyPoints,
    next_steps: sections.actionItems.join("\n"),
    attendees: attendees || [],
    source: "gemini",
    recorded_at: new Date().toISOString(),
  }).select().single();

  if (error) return res.status(500).json({ error: error.message });

  // Auto-score: fire scoring in background, don't block response
  scoreMeetingInternal(db, data.id).then((scoreResult) => {
    if (!("error" in scoreResult)) {
      console.log(`Auto-scored meeting ${data.id}: grade=${scoreResult.grade}`);
    }
  }).catch(() => {});

  return res.json({
    transcript: data,
    raw_gemini_output: fullText,
    auto_scoring: true,
  });
}

/* ========== AI Summarize (既存テキスト → 要約) ========== */

async function summarize(db: ReturnType<typeof getSupabaseAdmin>, id: string, res: VercelResponse) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "GEMINI_API_KEY not set" });

  const { data: transcript, error } = await db.from("meeting_transcripts").select("*").eq("id", id).single();
  if (error || !transcript) return res.status(404).json({ error: "議事録が見つかりません" });

  const text = transcript.transcript_text as string;
  if (!text) return res.status(400).json({ error: "文字起こしテキストがありません" });

  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

  const geminiRes = await fetch(geminiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{
        parts: [{
          text: `以下は人材紹介の面談議事録です。要約・分析してください。

${text}

以下の形式で出力:
## 要約（3-5行）
## 要点（箇条書き5-10個）
## アクションアイテム（箇条書き）
## 候補者の本音・ニーズ分析`,
        }],
      }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 4096 },
    }),
  });

  if (!geminiRes.ok) {
    const errText = await geminiRes.text();
    return res.status(500).json({ error: `Gemini API error: ${errText}` });
  }

  const geminiData = await geminiRes.json();
  const fullText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "";
  const sections = parseGeminiOutput(fullText);

  // DB更新
  await db.from("meeting_transcripts").update({
    summary: sections.summary,
    action_items: sections.actionItems,
    key_points: sections.keyPoints,
    next_steps: sections.actionItems.join("\n"),
  }).eq("id", id);

  return res.json({ summary: sections.summary, action_items: sections.actionItems, key_points: sections.keyPoints });
}

/* ========== Helpers ========== */

function parseGeminiOutput(text: string): {
  transcript: string;
  summary: string;
  keyPoints: string[];
  actionItems: string[];
} {
  const transcript = extractSection(text, "文字起こし") || text;
  const summary = extractSection(text, "要約") || extractSection(text, "要点") || "";
  const keyPointsRaw = extractSection(text, "要点") || "";
  const actionItemsRaw = extractSection(text, "アクションアイテム") || extractSection(text, "アクション") || "";

  return {
    transcript,
    summary,
    keyPoints: parseBullets(keyPointsRaw),
    actionItems: parseBullets(actionItemsRaw),
  };
}

function extractSection(text: string, heading: string): string {
  const regex = new RegExp(`##\\s*${heading}[^\\n]*\\n([\\s\\S]*?)(?=##|$)`, "i");
  const match = text.match(regex);
  return match ? match[1].trim() : "";
}

function parseBullets(text: string): string[] {
  return text.split("\n")
    .map((line) => line.replace(/^[-*・]\s*/, "").trim())
    .filter(Boolean);
}

/* ========== Meeting Quality Score ========== */

async function scoreMeeting(
  db: ReturnType<typeof getSupabaseAdmin>,
  id: string,
  res: VercelResponse,
) {
  const result = await scoreMeetingInternal(db, id);
  if ("error" in result) return res.status((result.status as number) || 500).json({ error: result.error });
  return res.json(result);
}

async function scoreMeetingInternal(
  db: ReturnType<typeof getSupabaseAdmin>,
  id: string,
): Promise<Record<string, unknown>> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { error: "GEMINI_API_KEY not set", status: 500 };

  const { data: meeting } = await db.from("meeting_transcripts").select("*").eq("id", id).single();
  if (!meeting) return { error: "議事録が見つかりません", status: 404 };

  const text = (meeting.transcript_text as string) || (meeting.summary as string) || "";
  if (!text) return { error: "テキストがありません", status: 400 };

  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
  const geminiRes = await fetch(geminiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: `あなたは建築技術者専門の人材紹介会社のセールスコーチです。
以下の面談記録を5つの観点で10点満点で採点してください。
**必ず各スコアの根拠として、面談記録からの具体的な引用（発言）を付けてください。**

## 面談記録:
${text.slice(0, 6000)}

## 採点基準（各10点）:
1. **ニーズ深掘り(needs)**: 候補者/企業の本音・課題を引き出せたか
2. **提案力(proposal)**: 具体的な求人・候補者を提示し、なぜマッチするか説明できたか
3. **信頼構築(trust)**: 業界知識を示し、専門家としての信頼を得られたか
4. **クロージング(closing)**: 次のアクションを明確にし、期限付きのコミットを得られたか
5. **情報収集(intel)**: 他社状況・温度感・意思決定者情報を聞き出せたか

## 出力形式（JSON厳守）:
{
  "scores": { "needs": 7, "proposal": 5, "trust": 8, "closing": 4, "intel": 6 },
  "total": 30,
  "grade": "B",
  "evidence": {
    "needs": "「〇〇さんが本当に求めているのは…」と深掘りできている",
    "proposal": "具体的な求人提示がなく、一般論にとどまった",
    "trust": "「施工管理の現場では…」と業界知識を交えて話せている",
    "closing": "「来週までに…」と期限を切れていない",
    "intel": "他社選考状況を聞き出せた「実は〇〇社も受けていて…」"
  },
  "strengths": ["具体的な強み1", "強み2"],
  "improvements": ["具体的な改善点1（どう言い換えれば良かったか含む）", "改善点2"],
  "leader_would": "リーダーならこの場面でこう話す、という具体的な1シーン再現（セリフ付き）"
}

重要: evidenceは面談記録から直接引用するか、「〜ができていない」という事実ベースの指摘にしてください。` }] }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 2048 },
    }),
  });

  if (!geminiRes.ok) return { error: "Gemini API error", status: 500 };

  const geminiData = await geminiRes.json();
  const raw = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "";

  let parsed;
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { raw };
  } catch {
    parsed = { raw };
  }

  if (parsed.scores) {
    await db.from("meeting_transcripts").update({ score_data: parsed }).eq("id", id);
  }

  return { meeting_id: id, ...parsed };
}

/* ========== Leader Playbook Extraction ========== */

async function extractPlaybook(
  db: ReturnType<typeof getSupabaseAdmin>,
  req: VercelRequest,
  res: VercelResponse,
) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "GEMINI_API_KEY not set" });

  const { leader_name, limit: maxMeetings } = req.body || {};

  let query = db.from("meeting_transcripts")
    .select("*")
    .order("recorded_at", { ascending: false })
    .limit(maxMeetings || 20);

  if (leader_name) {
    query = query.contains("attendees", [leader_name]);
  }

  const { data: meetings } = await query;
  if (!meetings || meetings.length === 0) {
    return res.json({ playbook: [], message: "面談記録がありません" });
  }

  const transcriptSummaries = meetings.map((m, i) =>
    `[面談${i + 1}] ${m.title}\n要約: ${m.summary || "なし"}\n要点: ${(m.key_points as string[])?.join(", ") || "なし"}\nアクション: ${(m.action_items as string[])?.join(", ") || "なし"}`
  ).join("\n\n");

  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
  const geminiRes = await fetch(geminiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: `あなたは建築技術者専門の人材紹介のセールスコーチです。
以下はリーダーの面談記録${meetings.length}件です。パターンを分析し、状況別プレイブックを生成してください。

${transcriptSummaries.slice(0, 8000)}

## 出力形式（JSON配列）:
[
  {
    "situation": "候補者が年収ダウンを嫌がる",
    "trigger": "候補者が「年収は下げたくない」と言った時",
    "leader_approach": "リーダーの具体的な対応方法（セリフ例含む）",
    "key_phrases": ["使える具体的なフレーズ1", "フレーズ2"],
    "avoid": "やってはいけないこと",
    "success_rate_hint": "この対応で次ステップに進む確率の目安"
  }
]

建築技術者の転職市場を踏まえて、最低8つの状況をカバーしてください。
例: 年収交渉、転勤拒否、資格不足、現職引き留め、競合他社比較、決定先延ばし、企業の求人条件厳しい、候補者の温度感が低い` }] }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 4096 },
    }),
  });

  if (!geminiRes.ok) return res.status(500).json({ error: "Gemini API error" });

  const geminiData = await geminiRes.json();
  const raw = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "";

  let playbook;
  try {
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    playbook = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
  } catch {
    playbook = [{ raw }];
  }

  return res.json({
    playbook,
    source_meetings: meetings.length,
    leader_name: leader_name || "全員",
  });
}

/* ========== Contextual Phase Coaching ========== */

async function contextualCoach(
  db: ReturnType<typeof getSupabaseAdmin>,
  req: VercelRequest,
  res: VercelResponse,
) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "GEMINI_API_KEY not set" });

  const { phase, candidate_id, company_id, deal_id, current_situation } = req.body || {};
  if (!phase) return res.status(400).json({ error: "phase required (1-4)" });

  // Gather context
  let candidateInfo = "";
  let companyInfo = "";
  let dealInfo = "";
  let pastMeetings = "";

  if (candidate_id) {
    const { data: c } = await db.from("candidates").select("*").eq("id", candidate_id).single();
    if (c) candidateInfo = `候補者: ${c.name}, 現職: ${c.current_position || "不明"}, 年収: ${c.current_salary || "不明"}万, 資格: ${(c.qualifications as string[])?.join(",") || "不明"}, 希望: ${c.desired_position || "不明"}, ステータス: ${c.status}`;
  }
  if (company_id) {
    const { data: co } = await db.from("companies").select("*").eq("id", company_id).single();
    if (co) companyInfo = `企業: ${co.name}, 業種: ${co.industry || "不明"}, 所在地: ${co.address || "不明"}`;
  }
  if (deal_id) {
    const { data: d } = await db.from("deals").select("*").eq("id", deal_id).single();
    if (d) dealInfo = `Deal: ${d.title}, ステージ: ${d.stage_name}, 滞在日数: ${d.days_in_stage}日, 金額: ${d.value}`;
  }
  if (candidate_id || deal_id) {
    const mq = candidate_id
      ? db.from("meeting_transcripts").select("summary, key_points, action_items").eq("candidate_id", candidate_id).order("recorded_at", { ascending: false }).limit(3)
      : db.from("meeting_transcripts").select("summary, key_points, action_items").eq("deal_id", deal_id).order("recorded_at", { ascending: false }).limit(3);
    const { data: meetings } = await mq;
    if (meetings && meetings.length > 0) {
      pastMeetings = meetings.map((m, i) => `過去面談${i + 1}: ${m.summary || "要約なし"}`).join("\n");
    }
  }

  const phaseGoals: Record<number, string> = {
    1: "仮説を立てる。候補者の転職動機を3パターン想定し、企業側の採用背景を理解する。マッチ求人を2-3件準備。",
    2: "本音を引き出す。「なぜ今転職か」の真因に迫る。年収・環境・キャリアの優先順位を確定。企業には候補者スペックを匿名で提示し、反応を見る。",
    3: "議事録を整理し、候補者の温度感を判定。企業へのフォロー（24時間以内）。次アクションを期限付きで設定。",
    4: "条件交渉をリード。候補者と企業の期待値ギャップを埋める。内定承諾までのタイムラインを管理。",
  };

  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
  const geminiRes = await fetch(geminiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: `あなたは建築技術者専門の人材紹介のベテランリーダーです。
ジュニアコンサルタントがフェーズ${phase}で何をすべきか、この具体的な案件の文脈で指導してください。

## フェーズ${phase}の目的:
${phaseGoals[phase as number] || ""}

## 案件情報:
${candidateInfo || "候補者情報なし"}
${companyInfo || "企業情報なし"}
${dealInfo || "Deal情報なし"}

## 過去の面談履歴:
${pastMeetings || "なし"}

## 現在の状況:
${current_situation || "特記事項なし"}

## 回答形式:
1. **今すぐやること**（具体的なアクション3つ、優先順位付き）
2. **この案件で聞くべき質問**（候補者向け/企業向け各3つ、なぜその質問が重要か含む）
3. **注意点**（この案件特有のリスク、よくある失敗パターン）
4. **リーダーならこう話す**（具体的なセリフ例1つ）

建築技術者の転職市場の文脈（中堅ゼネコン以上/ハウスメーカー、年収帯の実態）を踏まえてください。` }] }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 2048 },
    }),
  });

  if (!geminiRes.ok) return res.status(500).json({ error: "Gemini API error" });

  const geminiData = await geminiRes.json();
  const coaching = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "";

  return res.json({
    phase,
    coaching,
    context: { candidateInfo, companyInfo, dealInfo, pastMeetings: pastMeetings ? "あり" : "なし" },
  });
}
