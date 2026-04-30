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
 * PUT    /api/meetings/:id            → 議事録更新
 * DELETE /api/meetings/:id            → 議事録削除
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

    return res.status(404).json({ error: "Not found" });
  } catch (e) {
    return res.status(500).json({ error: (e as Error).message });
  }
}

/* ========== CRUD ========== */

async function listTranscripts(db: ReturnType<typeof getSupabaseAdmin>, req: VercelRequest, res: VercelResponse) {
  const { deal_id, candidate_id } = req.query;
  let query = db.from("meeting_transcripts").select("*").order("recorded_at", { ascending: false });
  if (deal_id && typeof deal_id === "string") query = query.eq("deal_id", deal_id);
  if (candidate_id && typeof candidate_id === "string") query = query.eq("candidate_id", candidate_id);
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ transcripts: data || [], total: (data || []).length });
}

async function createTranscript(db: ReturnType<typeof getSupabaseAdmin>, req: VercelRequest, res: VercelResponse) {
  const b = req.body;
  const { data, error } = await db.from("meeting_transcripts").insert({
    deal_id: b.deal_id || null,
    candidate_id: b.candidate_id || null,
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
  return res.status(201).json(data);
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

  const { audio_base64, mime_type, deal_id, candidate_id, title, attendees } = req.body;

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

  return res.json({
    transcript: data,
    raw_gemini_output: fullText,
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
