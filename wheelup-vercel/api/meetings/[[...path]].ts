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
 * POST   /api/meetings/:id/leader-feedback → リーダーフィードバック追加
 * POST   /api/meetings/extract-playbook → リーダー面談からプレイブック抽出
 * POST   /api/meetings/coach          → 案件文脈付きフェーズ別コーチング
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const segments: string[] = Array.isArray(req.query.path)
    ? req.query.path
    : req.query.path ? [req.query.path] : [];

  try {
    const db = getSupabaseAdmin();
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
    // --- /api/meetings/seed ---
    if (segments[0] === "seed") {
      return await seedMeetings(db, res);
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
    // --- /api/meetings/:id/leader-feedback ---
    if (sub === "leader-feedback" && req.method === "POST") {
      return await addLeaderFeedback(db, id, req, res);
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

/* ========== Leader Feedback ========== */

async function addLeaderFeedback(
  db: ReturnType<typeof getSupabaseAdmin>,
  id: string,
  req: VercelRequest,
  res: VercelResponse,
) {
  const { feedback } = req.body || {};
  if (!feedback || typeof feedback !== "string") {
    return res.status(400).json({ error: "feedback (string) is required" });
  }
  const { data, error } = await db
    .from("meeting_transcripts")
    .update({ leader_feedback: feedback.trim() })
    .eq("id", id)
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  return res.json(data);
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

/* ========== Seed Data ========== */

async function seedMeetings(
  db: ReturnType<typeof getSupabaseAdmin>,
  res: VercelResponse,
) {
  const { data: existing } = await db
    .from("meeting_transcripts")
    .select("id")
    .eq("is_leader", true)
    .limit(1);

  if (existing && existing.length > 0) {
    return res.json({
      message: "リーダーデータは既に存在します。重複投入を防止しました。",
      skipped: true,
    });
  }

  const SEED: Array<{ title: string; text: string; consultant_name: string; is_leader: boolean }> = [
    { consultant_name: "小林", is_leader: true, title: "小林+村上: 福元一成様（施工管理・RC経験7年）", text: "福元一成様との面談。村上が初期ヒアリングを実施し、小林がキャリア戦略を提案。候補者は施工管理でRC造経験7年、年収485万、3月末に離職済み。転職理由はコミュニケーション面でのフィードバックを受けて自信喪失した部分がある。小林は候補者の経験を業界水準と照らし合わせ「RC造7年の経験であれば施工管理として市場価値は十分ある。年収500万台は狙えるレンジ」と市場価値を提示。5年後のキャリアビジョンについて深掘りし、候補者の本音を引き出した。具体的な企業として中堅ゼネコンの施工管理ポジションを複数紹介。他社エージェントの利用状況を確認し、来週水曜までに求人3件をLINEで送る約束。次回面談を来週金曜に設定。" },
    { consultant_name: "小林", is_leader: true, title: "小林+安藤: komine wataru様（イオンネクスト建設部）", text: "komine wataru様との面談。安藤が初期ヒアリング、小林がキャリア戦略と業界知識を提供。候補者はイオンネクスト建設部で発注者ポジション。年収850万、データセンター案件を希望。180億規模の物件を担当した経験あり。小林は「データセンターは今後も需要が拡大する分野で、この経験年数と実績であれば更に上のポジションも十分狙える」と市場分析を提示。デベロッパーとゼネコンの両面からキャリアパスを具体的に説明。候補者の転職動機を深掘りし、本音として「より大規模な案件に携わりたい」「技術的な成長を求めている」というビジョンを引き出した。選考状況として他社エージェントは1社利用中であることを確認。データセンター系の案件を持つ企業を3社ピックアップし、来週中に詳細情報を共有する約束。LINE交換済み。" },
    { consultant_name: "小林", is_leader: true, title: "小林+安藤: 新井雅也様（東急建設→デベロッパー希望）", text: "新井雅也様との面談。安藤が状況確認、小林がキャリアの方向性を整理。候補者は東急建設からトレンドデザインへ転職。1級建築士の学科試験に合格。デベロッパー側へのキャリアチェンジを希望。年収は500-550万のレンジ。小林は「デベロッパーの年収が高いイメージは実はトップ5の企業が作り上げているもので、中途入社だと意外とそこまで上がらないケースが多い」と市場の現実を正直に伝達。候補者の転職理由を深掘りし、技術者としての成長志向が強いことを把握。他社での選考状況と温度感を確認し、まだ初期段階であることを把握。具体的な企業紹介は次回面談で行う予定として、来週までに方向性を整理しておくよう依頼。" },
    { consultant_name: "小林", is_leader: true, title: "小林+西村: 角陸斗様（設計一気通貫・一級建築士）", text: "角陸斗様との面談。西村が初期ヒアリングを実施、小林が業界知識とキャリア戦略を提供。候補者はプランテック在籍の一級建築士。年収620万。転職理由は「設計の一気通貫に携わりたいが、現職では基本設計までで実施設計以降はゼネコンに投げてしまう」という本音を把握。小林はデベロッパーの業務フローを具体的に説明。「発注者側だと土地仕入れのボリューム検討や法規チェックが中心で、図面を自分で書くことはなくなる。技術者としての成長志向が強いなら遠ざかる部分もある」と現実を提示。具体企業として島田アセットパートナーを紹介。アデコ経由で他社1社と並行中であることを確認。次回は具体求人を紹介する予定。" },
    { consultant_name: "小林", is_leader: true, title: "小林+西村: 山田喬之様（京阪電鉄不動産・開発職）", text: "山田喬之様との面談。西村が初期ヒアリング、小林が市場分析と戦略を提供。候補者は京阪電鉄不動産で戸建て住宅の造成・開発業務。年収650万。転職動機は「取り扱う物件の価格帯を上げたい」。小林は物件価格帯の違いが企業ブランドやビジネスモデルにどう影響するかを具体的に説明。「同じ造成地でもブランド力の差で1000万近い価格差がつく」と業界知識を展開。「野村不動産さんのリノベーション部門は一つの選択肢。東京なら東西さん、関西なら阪急阪神不動産さんのプロジェクトも検討できる」と具体企業名を提案。他社エージェント2社とリクルートの状況を確認。来週までに職務経歴書を整備し、求人を3件以上送付する約束。" },
    { consultant_name: "小林", is_leader: true, title: "小林+村上: 外山明様（酒田建設・施工管理→設計希望）", text: "外山明様との面談。村上が初期ヒアリング、小林がキャリア戦略を提供。候補者は酒田建設で施工管理、2級建築士保有。年収550万、27歳。転職動機は施工管理から設計へのキャリアチェンジ。小林は同じ大学出身であることを共有し信頼構築。設計とデベロッパーの違いを具体的に説明し「図面を書きたいのか、企画段階のコンセプト決定に携わりたいのか？ここで行くべき会社が全く変わってきます」と方向性の明確化を促進。ポートフォリオの準備を提案し、次回面談を月曜朝8時に設定。LINE交換済み。" },
    { consultant_name: "小林", is_leader: true, title: "小林+安藤: 山田果歩様（三井デザインテック・内装施工管理）", text: "山田果歩様との面談。安藤が初期ヒアリング、小林がキャリア戦略と業界知識を提供。候補者は三井デザインテックで内装施工管理。休職中で福岡への転居を希望。年収400万。小林はまず現職残留の可能性を確認。「三井デザインテックさんの福岡支店への異動は検討されましたか？」と社内の選択肢を先に探る。内装と建築の違いを専門的に説明し業界知識で信頼構築。PMポジションという代替キャリアパスを提示。体調不良での休職について面接での伝え方を具体的にアドバイス。福岡優先→東京バックアップの二段階戦略を設定。LINE交換済み。" },
    { consultant_name: "小林", is_leader: true, title: "小林+安藤: 岩本崇様（戸田建設→日商エステム・生産設計）", text: "岩本崇様との面談。安藤が初期ヒアリング、小林がキャリア分析と戦略を提供。候補者は戸田建設から日商エステムに転職し発注者側で生産設計を担当。年収740万。転職動機はより上流の業務に携わりたいという希望。小林は候補者の不満が「会社特有の問題なのか構造的な問題なのか」を切り分けて深掘り。「日商エステムさんの品質基準と阪急さんや野村プラウドさんの品質基準は全く違います」とデベロッパー品質基準の比較を提示。設計事務所のサラカンという代替ポジションを提案。転勤許容度を家族状況に紐付けて確認。来週中に求人をLINEで共有する約束。" },
    { consultant_name: "小林", is_leader: true, title: "小林+西村: 小川ゆう様（組織設計事務所・一級建築士）", text: "小川ゆう様との面談。西村が初期ヒアリング、小林がキャリアの方向性整理と業界知識を提供。候補者は43歳、一級建築士、共同住宅設計のスペシャリスト。転職動機は社長交代で方針がホテル・オフィスビルに転換し共同住宅の案件が減少。希望年収は基本給700＋残業込みで800万。他社エージェント10名と面談済み。小林は住宅へのこだわりの「なぜ」を深掘り。分譲vs賃貸の違いを企業配置の観点から説明。「賃貸はコンセプトやデザインの自由度が高い。候補者のクリエイティブ志向なら賃貸マンション特化が合う」とマッチング。年収700超えが前提条件として分譲もセーフティゾーンとして並行検討を提案。次回月曜18:30にオンライン面談を設定。" },
    { consultant_name: "小林", is_leader: true, title: "小林+西村: 中道康介様（タマホーム・リフォーム営業兼施工管理）", text: "中道康介様との面談。西村が初期ヒアリング、小林がキャリア戦略と業界知識を提供。候補者はタマホームでリフォーム営業兼施工管理。前職は大和ハウスで営業。年収690万だが歩合比率が8割と高く基本給が低い。本音は経営に関わる仕事がしたい。小林は大和ハウスへの出戻りを正直に最善ルートとして提案。「社内のつながりを活用してリファラルで戻るのが一番確度が高い」と率直にアドバイス。施工管理経験2年では大手は難しく入り口は営業になる現実を正直に伝達。1級施工管理技士補の資格取得を並行で進めるキャリア戦略を提案。LINE交換済み。" },
    { consultant_name: "小林", is_leader: true, title: "小林+安藤: 東浦隆介様（東畑建築事務所・設計職・一級建築士）", text: "東浦隆介様との面談。安藤が初期ヒアリング、小林が業界構造とキャリア戦略を提供。候補者は東畑建築事務所で設計職、一級建築士、30歳、年収600万。転職動機は残業の多さと働き方改善。小林は業界構造から残業の原因を説明。「設計事務所の残業は構造的な問題で、上流に行くと残業が構造的に減る理由がある」と根本原因を分析。コンサル会社の実態をリアルに説明。具体企業としてリノベル都市創造事業部の詳細を紹介。他社エージェントの利用状況を確認。次回は具体求人を紹介する予定。LINE交換済み。" },
    { consultant_name: "小林", is_leader: true, title: "小林+西村: 佐藤亮太郎様（コクヨ・内装施工管理）", text: "佐藤亮太郎様との面談。西村が初期ヒアリング、小林がキャリア戦略を提供。候補者はコクヨで内装施工管理。年収650万、希望年収700万超。小林は「正直に言うと、今のコクヨさんのバランスはトップクラスに良い。年収・働き方・経験のバランスを考えると、今すぐ動く必要がないかもしれない」と率直にアドバイス。「コクヨの不動産再生事業部への異動は検討されましたか？」と社内キャリアパスを具体的に提示。「1級建築士を取得した後の方が市場での選択肢が格段に広がる」とタイミングのアドバイス。他社エージェントの利用状況を確認。" },
    { consultant_name: "小林", is_leader: true, title: "小林+西村: 日野様（ゼネコン設計・CM希望・一級建築士）", text: "日野様との面談。西村が初期ヒアリング、小林が業界構造とキャリア戦略を提供。候補者はゼネコンの設計職、一級建築士。CM会社への転職を希望。小林はデベロッパーの業務フローを構造的に説明。CMとデベロッパーの違いを明確化し「CMは調整業務が中心で設計的要素が薄くなる」とトレードオフを整理。「セーフティーゾーンとして元請けで今より良い会社、挑戦枠として発注者側」という二軸の求人戦略を提案。他社エージェントの選考状況を確認。次回はGW明け5月7日18時に面談設定。LINE交換済み。" },
    { consultant_name: "小林", is_leader: true, title: "小林+安藤: 伊藤優貴様（三井ホーム・住宅設計）", text: "伊藤優貴様との面談。安藤が初期ヒアリング、小林がキャリア戦略と業界知識を提供。候補者は三井ホームで住宅設計。転職動機は注文住宅体制変更で外注管理主体に変わり設計から離れること。小林は前職ミサワホームの経験を共有し親近感を構築。外注設計の実態を掘り下げ問題の本質を特定。内装設計のハードルを正直に説明。「オフィスの空間デザインならデザイナーと実施設計者が分かれないポジションがある」と具体的な代替ルートを提案。ポートフォリオの準備と協力を提案。来週水曜15時に次回面談設定。LINE交換済み。" },
    { consultant_name: "小林", is_leader: true, title: "小林+安藤: 石原敬正様（アーネストワン・施工管理・建売住宅）", text: "石原敬正様との面談。安藤が初期ヒアリング、小林がキャリア戦略と転職プランニングを提供。候補者はアーネストワンで建売住宅の施工管理、28歳、年収650万。子供が生まれるため大阪に戻りたいのが第一優先。小林は現職への交渉を先に提案。転職活動と現職交渉の並行戦略を設計。退職交渉のタイミングを逆算し「6月までに内定先を決めて、9月末まで在籍、10月入社が現実的なライン」とタイムスケジュールを提示。住宅の将来性について業界視点で議論。次回はGW明けに求人紹介面談を設定。LINE交換済み。" },
    { consultant_name: "小林", is_leader: true, title: "小林+西村: 河原克昭様（フジタ・ゼネコン施工管理9年・1級建築施工管理技士）", text: "河原克昭様との面談。西村が初期ヒアリング、小林がキャリア戦略と業界構造の多選択肢提示を実施。候補者はフジタでゼネコン施工管理9年目、1級建築施工管理技士保有。年収約800万。転職動機は残業の多さ、所長になる自信がない、精神的に辛く現在休職中。他社エージェント3-4名と話済み。小林はまず現職残留の可能性を確認。住宅メーカー施工管理の実態を元ミサワホーム経験者として具体説明。デベロッパー・CM・事業会社・不動産管理会社の4つの選択肢を体系的に説明。CMの実態を具体解説。「2段階説法」を展開。「①働く環境下をどう整えるか→②その上で業界を選ぶ」と提案。来週旭化成との商談を活用すると提案。次回は月曜午前に求人紹介面談を設定。グループLINE交換済み。" },
    { consultant_name: "西村", is_leader: false, title: "西村: 角様（設計事務所・一級建築士）初期ヒアリング", text: "角様との初期面談。ビズリーチ経由でコンタクト。現職はプランテック、一級建築士・宅建保有。転職理由は一気通貫で設計に携わりたい。アデコ経由で他社1社と並行中。年収620万、希望は550万以上。東京または福岡で検討中。" },
    { consultant_name: "西村", is_leader: false, title: "西村: 山田様（京阪電鉄不動産・開発職）初期ヒアリング", text: "山田様との初期面談。ビズリーチ経由。積水ハウスから京阪電鉄不動産へ転職済み。年収650万。転職理由は経済状況を見て早めに動きたい、物件価格帯を上げたい。他社エージェント2社と並行。" },
    { consultant_name: "辻内", is_leader: false, title: "辻内: 吉田様（プラント設備・メンテナンス8年）", text: "吉田様との面談。プラント設備のメンテナンスで8年の経験。危険物取扱者の資格保有。転職理由は年収アップと出張を減らしたいこと。年収は現在480万で600万以上を希望。来週木曜までに求人情報を共有する約束。" },
    { consultant_name: "辻内", is_leader: false, title: "辻内: 山本様（土木現場管理6年・環境コンサル志望）", text: "山本様との面談。土木の現場管理で6年の経験。1級土木施工管理技士の資格保有。転職理由は現場から離れたいという本音。年収は現在450万で500万台を希望。来週中に環境コンサル系の求人をリストアップして送付する約束。" },
    { consultant_name: "安藤", is_leader: false, title: "安藤: 渡辺様（建築設計3年・ディベロッパー志望）", text: "渡辺様との面談。建築設計で3年の経験。二級建築士。転職理由は給与の低さと残業。デベロッパー側に行きたいという希望。年収は現在380万で450万以上を目指したい。来週月曜に求人を3件提案する約束。" },
    { consultant_name: "村上", is_leader: false, title: "村上: 伊藤様（空調設備施工管理10年・管理職希望）", text: "伊藤様との面談。空調設備の施工管理で10年の経験。管工事施工管理技士の資格保有。転職理由はマネジメントポジションへのステップアップ希望。年収は現在520万で600万以上を希望。他社は1社選考中で一次面接通過済み。来週水曜までに管理職ポジションの案件を5件送付する約束。LINE交換済み。" },
    { consultant_name: "村上", is_leader: false, title: "村上: 外山様（施工管理→設計希望）初期ヒアリング", text: "外山様との初期面談。酒田建設で施工管理を担当。2級建築士保有。施工管理から設計へのキャリアチェンジを希望。年収550万、27歳、練馬在住。来週月曜朝8時に再面談を設定。" },
    { consultant_name: "安藤", is_leader: false, title: "安藤: 山田果歩様（三井デザインテック）初期ヒアリング", text: "山田果歩様との初期面談。三井デザインテックで内装施工管理。休職中で福岡への転居を希望。年収400万。転職理由は体調不良による休職と環境変化の希望。来週中にフォローアップ予定。" },
    { consultant_name: "安藤", is_leader: false, title: "安藤: 岩本様（日商エステム・生産設計）初期ヒアリング", text: "岩本様との初期面談。戸田建設から日商エステムに転職し発注者側で生産設計。年収740万。上流の業務に携わりたいが品質基準への不満あり。来週中に求人を共有する約束。" },
    { consultant_name: "安藤", is_leader: false, title: "安藤: 東浦様（東畑建築事務所・設計職）初期ヒアリング", text: "東浦様との初期面談。東畑建築事務所で設計職、一級建築士、30歳。年収600万。転職動機は残業の多さと働き方改善。来週中に求人紹介予定。" },
    { consultant_name: "西村", is_leader: false, title: "西村: 佐藤様（コクヨ・内装施工管理）初期ヒアリング", text: "佐藤亮太郎様との初期面談。コクヨで内装施工管理。年収650万、希望年収700万超。キャリアアップを希望。他社エージェントの利用はなし。次回は資格取得の進捗に合わせて相談予定。" },
    { consultant_name: "西村", is_leader: false, title: "西村: 日野様（ゼネコン設計・CM希望）初期ヒアリング", text: "日野様との初期面談。ビズリーチ経由。ゼネコンの設計職で一級建築士。名古屋希望でCM会社への転職を希望。年収570万。GW明け5月7日に次回面談設定。" },
    { consultant_name: "安藤", is_leader: false, title: "安藤: 伊藤様（三井ホーム・住宅設計）初期ヒアリング", text: "伊藤優貴様との初期面談。三井ホームで住宅設計。年収500万。注文住宅の体制変更で外注管理主体になり設計から離れることが転職動機。来週水曜に次回面談設定。" },
    { consultant_name: "安藤", is_leader: false, title: "安藤: 石原様（アーネストワン・施工管理）初期ヒアリング", text: "石原敬正様との初期面談。アーネストワンで建売住宅の施工管理、28歳。年収650万。大阪に戻りたい。来週中に求人紹介予定。" },
    { consultant_name: "西村", is_leader: false, title: "西村: 河原様（フジタ・ゼネコン施工管理9年）初期ヒアリング", text: "河原克昭様との初期面談。フジタでゼネコン施工管理9年目、1級建築施工管理技士保有。年収約800万。転職動機は残業の多さ、精神的に辛く現在休職中。他社エージェント3-4名と話済み。次回月曜午前に求人紹介面談を設定。" },
  ];

  function quickScore(text: string, isLeader: boolean) {
    const has = (kw: string) => text.includes(kw) ? 1 : 0;
    let needs = 3 + has("本音") + has("深掘り") + has("転職理由") + has("転職動機") + has("希望") + has("キャリア");
    let proposal = 2 + has("具体的") + has("企業") + has("求人") + has("提案") + has("選択肢") + has("ポジション");
    let trust = 2 + has("業界") + has("構造") + has("経験") + has("知識") + has("市場") + has("正直");
    let closing = 2 + has("来週") + has("次回") + has("LINE") + has("設定") + has("約束") + has("スケジュール");
    let intel = 2 + has("他社") + has("エージェント") + has("選考") + has("温度感") + has("並行") + has("年収");
    if (text.length > 500) { needs++; proposal++; trust++; }
    if (isLeader) { needs = Math.min(10, needs + 2); proposal = Math.min(10, proposal + 1); trust = Math.min(10, trust + 1); closing = Math.min(10, closing + 2); intel = Math.min(10, intel + 1); }
    needs = Math.min(10, needs); proposal = Math.min(10, proposal); trust = Math.min(10, trust); closing = Math.min(10, closing); intel = Math.min(10, intel);
    const total = needs + proposal + trust + closing + intel;
    const grade = total >= 40 ? "S" : total >= 35 ? "A" : total >= 25 ? "B" : "C";
    return { scores: { needs, proposal, trust, closing, intel }, total, grade };
  }

  const results: Array<{ title: string; grade: string; error?: string }> = [];

  for (const m of SEED) {
    const daysAgo = Math.floor(Math.random() * 14) + 1;
    const recordedAt = new Date(Date.now() - daysAgo * 86400000).toISOString();
    const scoreData = quickScore(m.text, m.is_leader);
    const { error } = await db.from("meeting_transcripts").insert({
      consultant_name: m.consultant_name,
      is_leader: m.is_leader,
      title: m.title,
      transcript_text: m.text,
      score_data: scoreData,
      source: "seed",
      recorded_at: recordedAt,
    });
    results.push({ title: m.title, grade: scoreData.grade, error: error?.message });
  }

  const ok = results.filter(r => !r.error).length;
  return res.json({ message: `シード完了: ${ok}件投入`, leader: SEED.filter(s => s.is_leader).length, member: SEED.filter(s => !s.is_leader).length, results });
}
