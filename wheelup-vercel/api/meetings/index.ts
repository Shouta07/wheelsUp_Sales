import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createHash } from "node:crypto";
import { getSupabaseAdmin } from "../_lib/supabase-admin.js";
import { getRequestUser, isLeader, canReadMeeting, canWriteMeeting, send403 } from "../_lib/auth.js";

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
  const rawPath = req.query.path;
  const toSegments = (s: string) => s.split("/").map((x) => x.trim()).filter(Boolean);
  const segments: string[] = Array.isArray(rawPath)
    ? rawPath.flatMap((p) => toSegments(String(p)))
    : typeof rawPath === "string" && rawPath
    ? toSegments(rawPath)
    : [];

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
    // --- /api/meetings/:id ---
    const id = segments[0];
    const sub = segments[1] || "";

    if (!sub) {
      if (req.method === "GET") return await getTranscript(db, id, req, res);
      if (req.method === "PUT") return await updateTranscript(db, id, req, res);
      if (req.method === "DELETE") return await deleteTranscript(db, id, req, res);
    }

    // --- /api/meetings/:id/summarize ---
    if (sub === "summarize" && req.method === "POST") {
      return await summarize(db, id, res);
    }
    // --- /api/meetings/:id/score ---
    if (sub === "score" && req.method === "POST") {
      return await scoreMeeting(db, id, req, res);
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
  const currentUser = getRequestUser(req);

  // リーダー面談の閲覧はリーダー本人のみ。consultant_name が一致しないリーダーの面談も見せない。
  if (is_leader === "true") {
    if (!isLeader(currentUser)) {
      return res.json({ transcripts: [], total: 0 });
    }
    if (consultant_name && typeof consultant_name === "string" && consultant_name !== currentUser) {
      return res.json({ transcripts: [], total: 0 });
    }
  }

  let query = db.from("meeting_transcripts").select("*").order("recorded_at", { ascending: false });
  if (deal_id && typeof deal_id === "string") query = query.eq("deal_id", deal_id);
  if (candidate_id && typeof candidate_id === "string") query = query.eq("candidate_id", candidate_id);
  if (consultant_name && typeof consultant_name === "string") query = query.eq("consultant_name", consultant_name);
  if (is_leader === "true") query = query.eq("is_leader", true);
  if (is_leader === "false") query = query.eq("is_leader", false);
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });

  // 念のためサーバ側でも閲覧不可な面談を弾く (二重防御)。
  const filtered = (data || []).filter((m) => canReadMeeting(currentUser, m as { consultant_name?: string; is_leader?: boolean }));
  return res.json({ transcripts: filtered, total: filtered.length });
}

async function createTranscript(db: ReturnType<typeof getSupabaseAdmin>, req: VercelRequest, res: VercelResponse) {
  const b = req.body;
  const currentUser = getRequestUser(req);
  // なりすまし防止: body の consultant_name と is_leader が、ヘッダのユーザーと一致しないと拒否。
  if (!canWriteMeeting(currentUser, { consultant_name: b.consultant_name, is_leader: b.is_leader })) {
    return send403(res, "他のメンバーとして書き込みできません");
  }
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
  // 自動採点は行わない (運用面のクォータ制御のためユーザー操作で 1 件ずつ採点する設計)
  return res.status(201).json({ ...data, auto_scoring: false });
}

async function getTranscript(db: ReturnType<typeof getSupabaseAdmin>, id: string, req: VercelRequest, res: VercelResponse) {
  const { data, error } = await db.from("meeting_transcripts").select("*").eq("id", id).single();
  if (error) return res.status(404).json({ error: "議事録が見つかりません" });
  const currentUser = getRequestUser(req);
  if (!canReadMeeting(currentUser, data as { consultant_name?: string; is_leader?: boolean })) {
    return send403(res, "この面談を閲覧する権限がありません");
  }
  return res.json(data);
}

async function updateTranscript(db: ReturnType<typeof getSupabaseAdmin>, id: string, req: VercelRequest, res: VercelResponse) {
  const b = req.body;
  // 既存レコードを取って書き込み権限を確認 (consultant_name/is_leader を見たい)
  const { data: existing } = await db.from("meeting_transcripts").select("consultant_name, is_leader").eq("id", id).single();
  if (!existing) return res.status(404).json({ error: "議事録が見つかりません" });
  if (!canWriteMeeting(getRequestUser(req), existing as { consultant_name?: string; is_leader?: boolean })) {
    return send403(res, "この面談を編集する権限がありません");
  }
  const updates: Record<string, unknown> = {};
  const fields = ["title", "transcript_text", "summary", "action_items", "key_points", "next_steps", "attendees", "duration_minutes", "deal_id", "candidate_id"];
  for (const f of fields) { if (b[f] !== undefined) updates[f] = b[f]; }
  const { data, error } = await db.from("meeting_transcripts").update(updates).eq("id", id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  return res.json(data);
}

async function deleteTranscript(db: ReturnType<typeof getSupabaseAdmin>, id: string, req: VercelRequest, res: VercelResponse) {
  const { data: existing } = await db.from("meeting_transcripts").select("consultant_name, is_leader").eq("id", id).single();
  if (!existing) return res.status(404).json({ error: "議事録が見つかりません" });
  if (!canWriteMeeting(getRequestUser(req), existing as { consultant_name?: string; is_leader?: boolean })) {
    return send403(res, "この面談を削除する権限がありません");
  }
  const { error } = await db.from("meeting_transcripts").delete().eq("id", id);
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ deleted: true });
}

/* ========== Gemini Transcription ========== */

async function transcribeWithGemini(db: ReturnType<typeof getSupabaseAdmin>, req: VercelRequest, res: VercelResponse) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "GEMINI_API_KEY not set" });

  const { audio_base64, mime_type, deal_id, candidate_id, title, attendees, consultant_name, is_leader, recorded_at } = req.body;

  if (!audio_base64) {
    return res.status(400).json({ error: "audio_base64 が必要です" });
  }

  // 文字起こしも面談作成なので、なりすまし防止のため consultant_name/is_leader はヘッダのユーザーと一致する必要がある。
  if (!canWriteMeeting(getRequestUser(req), { consultant_name, is_leader })) {
    return send403(res, "他のメンバーとして書き込みできません");
  }

  // base64 文字列のサイズから元バイナリサイズを概算（Vercel ボディ上限 4.5MB ≒ base64 で 6MB）
  const approxBytes = Math.floor((audio_base64.length * 3) / 4);
  const MAX_BYTES = 4 * 1024 * 1024; // 4MB の元バイナリ
  if (approxBytes > MAX_BYTES) {
    return res.status(413).json({
      error: `音声ファイルが大きすぎます (約 ${(approxBytes / 1024 / 1024).toFixed(1)}MB)。${(MAX_BYTES / 1024 / 1024).toFixed(0)}MB 以下に分割するか圧縮してください。`,
    });
  }

  const mimeType = mime_type || "audio/webm";

  // Gemini API で文字起こし
  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

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
    recorded_at: recorded_at || new Date().toISOString(),
  }).select().single();

  if (error) return res.status(500).json({ error: error.message });
  // 自動採点は行わない (運用面のクォータ制御のためユーザー操作で 1 件ずつ採点する設計)
  return res.json({
    transcript: data,
    raw_gemini_output: fullText,
    auto_scoring: false,
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

  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

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
  req: VercelRequest,
  res: VercelResponse,
) {
  // 採点する＝面談を読める権限が前提
  const { data: existing } = await db.from("meeting_transcripts").select("consultant_name, is_leader").eq("id", id).single();
  if (!existing) return res.status(404).json({ error: "議事録が見つかりません" });
  if (!canReadMeeting(getRequestUser(req), existing as { consultant_name?: string; is_leader?: boolean })) {
    return send403(res, "この面談を採点する権限がありません");
  }
  const force = req.method === "POST" && (req.body?.force === true || req.query?.force === "1");
  const result = await scoreMeetingInternal(db, id, { force });
  if ("error" in result) return res.status((result.status as number) || 500).json({ error: result.error });
  return res.json(result);
}

async function scoreMeetingInternal(
  db: ReturnType<typeof getSupabaseAdmin>,
  id: string,
  opts: { force?: boolean } = {},
): Promise<Record<string, unknown>> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { error: "GEMINI_API_KEY not set", status: 500 };

  const { data: meeting } = await db.from("meeting_transcripts").select("*").eq("id", id).single();
  if (!meeting) return { error: "議事録が見つかりません", status: 404 };

  const text = (meeting.transcript_text as string) || (meeting.summary as string) || "";
  if (!text) return { error: "テキストがありません", status: 400 };

  // リーダーの面談タイトルを学習リソースの素材として注入（URL ハルシネーション回避）
  let leaderRefs = "";
  try {
    const { data: leaderRows } = await db.from("meeting_transcripts")
      .select("title, summary")
      .eq("is_leader", true)
      .order("recorded_at", { ascending: false })
      .limit(5);
    if (leaderRows && leaderRows.length > 0) {
      leaderRefs = leaderRows
        .map((r, i) => `${i + 1}. 「${r.title}」 ${(r.summary as string)?.slice(0, 80) || ""}`)
        .join("\n");
    }
  } catch { /* ignore */ }

  // 採点入力ハッシュ。transcript_text と leaderRefs が同一なら Gemini を再呼び出ししない（無料枠保護）。
  const inputHash = createHash("sha256").update(`${text}\n---\n${leaderRefs}`).digest("hex");
  if (!opts.force && meeting.score_data && meeting.score_input_hash === inputHash) {
    return { meeting_id: id, cached: true, ...(meeting.score_data as Record<string, unknown>) };
  }

  // 採点は gemini-2.5-flash-lite を使う。
  // - 構造化出力 (responseSchema) の遵守が gemini-2.5-flash より素直
  // - 出力品質も採点用途では十分
  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`;

  // 503 UNAVAILABLE (Gemini 側の一時過負荷) は短い待機で復旧することが多いので最大 2 回まで自動再試行。
  const callGemini = async (): Promise<Response> => {
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    let lastRes: Response | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      lastRes = await fetch(geminiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: requestBody,
      });
      if (lastRes.ok) return lastRes;
      // 過負荷系のみ再試行 (503/500)。429 はクォータなので即座にエラー返す。
      if (lastRes.status !== 503 && lastRes.status !== 500) return lastRes;
      if (attempt < 2) await sleep(1500 * (attempt + 1)); // 1.5s, 3s
    }
    return lastRes as Response;
  };

  const requestBody = JSON.stringify({
      contents: [{ parts: [{ text: `あなたは建築技術者専門の人材紹介会社のセールスコーチです。
以下の面談記録を5つの観点で10点満点で採点し、ダイジェスト用キーモーメントと学習リソースまで含めて返してください。
**必ず各スコアの根拠として、面談記録からの具体的な引用（発言）を付けてください。**

## 面談記録:
${text.slice(0, 6000)}

## 参考: リーダーの過去面談（学習リソース推薦時に source_name として引用してよい）:
${leaderRefs || "（なし）"}

## 採点基準（各10点）:
1. **ニーズ深掘り(needs)**: 候補者/企業の本音・課題を引き出せたか
2. **提案力(proposal)**: 具体的な求人・候補者を提示し、なぜマッチするか説明できたか
3. **信頼構築(trust)**: 業界知識を示し、専門家としての信頼を得られたか
4. **クロージング(closing)**: 次のアクションを明確にし、期限付きのコミットを得られたか
5. **情報収集(intel)**: 他社状況・温度感・意思決定者情報を聞き出せたか

## 出力形式（JSON厳守、コードフェンスや前後の説明文を出さない）:
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
  "leader_would": "リーダーならこの場面でこう話す、という具体的な1シーン再現（セリフ付き）",
  "key_moments": [
    {
      "text": "面談記録から抜き出した実際の発言を50〜120字で",
      "axis": "needs",
      "axis_label": "ニーズ深掘り",
      "relevance": 0.9,
      "speaker": "コンサル"
    }
  ],
  "learning_resources": [
    {
      "axis": "needs",
      "title": "本音を引き出す質問の型",
      "description": "なぜ転職するのかを3層で深掘りする手順を、リーダー面談の同じ場面で再現する",
      "source_type": "playbook",
      "source_name": "上記参考リーダー面談のタイトル",
      "playbook_situation": "候補者が「年収を上げたい」と表層的な理由しか出さない場面"
    }
  ]
}

要件:
- key_moments は 4〜6 件、面談中の主要な転換点（強みでも弱みでも）を時系列順で。axis は needs/proposal/trust/closing/intel のいずれか、axis_label は日本語ラベル、relevance は 0〜1。speaker は判別できれば「候補者」「企業」「コンサル」、不明なら省略。timestamp や seconds は不明なら省略（推測しない）。
- learning_resources は弱い軸（点数の低い 2 軸）を中心に 2〜3 件。source_type は基本 "playbook"、source_name は参考リストの face value をそのまま使うか、空なら "リーダー面談記録"。url は決して推測しない（URLを書かない）。
- evidence は面談記録から直接引用するか、「〜ができていない」という事実ベースの指摘にしてください。
- 出力は単一の JSON オブジェクトのみ。前置きや結語は禁止。` }] }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 4096,
        responseMimeType: "application/json",
        // Schema を強制してパースエラー → リトライ をゼロに。精度と省エネを両立。
        responseSchema: {
          type: "object",
          properties: {
            scores: {
              type: "object",
              properties: {
                needs: { type: "integer" },
                proposal: { type: "integer" },
                trust: { type: "integer" },
                closing: { type: "integer" },
                intel: { type: "integer" },
              },
              required: ["needs", "proposal", "trust", "closing", "intel"],
            },
            total: { type: "integer" },
            grade: { type: "string" },
            evidence: {
              type: "object",
              properties: {
                needs: { type: "string" },
                proposal: { type: "string" },
                trust: { type: "string" },
                closing: { type: "string" },
                intel: { type: "string" },
              },
            },
            strengths: { type: "array", items: { type: "string" } },
            improvements: { type: "array", items: { type: "string" } },
            leader_would: { type: "string" },
            key_moments: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  text: { type: "string" },
                  axis: { type: "string" },
                  axis_label: { type: "string" },
                  relevance: { type: "number" },
                  speaker: { type: "string" },
                },
                required: ["text", "axis"],
              },
            },
            learning_resources: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  axis: { type: "string" },
                  title: { type: "string" },
                  description: { type: "string" },
                  source_type: { type: "string" },
                  source_name: { type: "string" },
                  playbook_situation: { type: "string" },
                },
                required: ["axis", "title", "description"],
              },
            },
          },
          required: ["scores", "evidence"],
        },
      },
  });

  const geminiRes = await callGemini();

  if (!geminiRes.ok) {
    const errText = await geminiRes.text().catch(() => "");
    if (geminiRes.status === 429) {
      // Google の生メッセージをそのまま出す。原因が "quota" なのか "billing" なのか "API not enabled" なのか区別するため。
      return {
        error: `[Gemini 429] ${errText.slice(0, 800)}`,
        status: 429,
      };
    }
    return { error: `Gemini API error: ${errText.slice(0, 200)}`, status: 502 };
  }

  const geminiData = await geminiRes.json();
  const raw = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "";

  // LLM が出力する JSON にしばしば混入する不可視/全角文字を ASCII 相当に正規化。
  // “” はカーリーダブル、‘’ はカーリーシングル、﻿ は BOM、　 は全角スペース。
  const normalizeJson = (s: string) =>
    s
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, "'")
      .replace(/﻿/g, "")
      .replace(/　/g, " ");

  let parsed: Record<string, unknown> = {};
  let parseError: string | null = null;
  try {
    // responseSchema を強制しているので原則そのまま JSON.parse できるはず。
    // まずは raw を直接試し、失敗したらコードフェンス剥がし → {} 抽出 の順で復旧。
    // LLM が混入するカーリー引用符/BOM/全角スペースは事前に正規化。
    const trimmed = normalizeJson(raw.trim());
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      const cleaned = trimmed.replace(/```(?:json)?\s*([\s\S]*?)```/g, "$1");
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
      else throw new Error("JSON が含まれていません");
    }
  } catch (e) {
    parseError = (e as Error).message;
  }

  // total を実値で再計算（モデルが間違えていることがある）
  const s = (parsed as { scores?: Record<string, number> }).scores;
  if (s && typeof s === "object") {
    const total = ["needs", "proposal", "trust", "closing", "intel"]
      .reduce((acc, k) => acc + (typeof s[k] === "number" ? s[k] : 0), 0);
    parsed.total = total;
    if (!parsed.grade) {
      parsed.grade = total >= 40 ? "S" : total >= 35 ? "A" : total >= 25 ? "B" : total >= 15 ? "C" : "D";
    }

    // key_moments / learning_resources のサニタイズ（型不整合を吸う）
    const km = (parsed as { key_moments?: unknown }).key_moments;
    if (Array.isArray(km)) {
      parsed.key_moments = km
        .filter((m): m is Record<string, unknown> => !!m && typeof m === "object")
        .slice(0, 8)
        .map((m) => ({
          text: String(m.text || "").slice(0, 240),
          axis: typeof m.axis === "string" ? m.axis : "needs",
          axis_label: typeof m.axis_label === "string" ? m.axis_label : "",
          relevance: typeof m.relevance === "number" ? Math.min(1, Math.max(0, m.relevance)) : 0.5,
          ...(typeof m.speaker === "string" && m.speaker ? { speaker: m.speaker } : {}),
          ...(typeof m.timestamp === "string" && m.timestamp ? { timestamp: m.timestamp } : {}),
          ...(typeof m.seconds === "number" ? { seconds: m.seconds } : {}),
        }))
        .filter((m) => m.text);
    } else {
      parsed.key_moments = [];
    }

    const lr = (parsed as { learning_resources?: unknown }).learning_resources;
    if (Array.isArray(lr)) {
      parsed.learning_resources = lr
        .filter((r): r is Record<string, unknown> => !!r && typeof r === "object")
        .slice(0, 5)
        .map((r) => ({
          axis: typeof r.axis === "string" ? r.axis : "needs",
          title: String(r.title || "").slice(0, 120),
          description: String(r.description || "").slice(0, 300),
          source_type: (r.source_type === "video" || r.source_type === "article" || r.source_type === "playbook")
            ? r.source_type : "playbook",
          ...(typeof r.source_name === "string" && r.source_name ? { source_name: r.source_name } : {}),
          ...(typeof r.playbook_situation === "string" && r.playbook_situation ? { playbook_situation: r.playbook_situation } : {}),
          // url はハルシネーション防止のため捨てる（プロンプトでも禁じているが念のため）
        }))
        .filter((r) => r.title);
    } else {
      parsed.learning_resources = [];
    }

    await db.from("meeting_transcripts").update({ score_data: parsed, score_input_hash: inputHash }).eq("id", id);
  } else if (parseError) {
    // 原因切り分けのため Gemini の生レスポンス先頭を error 文字列に含める (フロントが raw を捨てるため)
    return {
      error: `スコアJSONのパース失敗: ${parseError}\n---raw output (head 800ch)---\n${raw.slice(0, 800)}`,
      raw: raw.slice(0, 2000),
      status: 502,
    };
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
  // リーダーフィードバックを書けるのはリーダー本人のみ
  if (!isLeader(getRequestUser(req))) {
    return send403(res, "リーダーフィードバックはリーダーのみ追加できます");
  }
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

// 同一ソース面談集合からの再生成を避けるキャッシュキー。
// 面談IDの並び + 各行の updated_at をハッシュ。1件でも更新されれば自動的に無効化される。
function computePlaybookCacheKey(meetings: Array<{ id: string; updated_at?: string | null; recorded_at?: string | null }>): string {
  const seed = meetings
    .map((m) => `${m.id}:${m.updated_at || m.recorded_at || ""}`)
    .sort()
    .join("|");
  return createHash("sha256").update(seed).digest("hex");
}

async function extractPlaybook(
  db: ReturnType<typeof getSupabaseAdmin>,
  req: VercelRequest,
  res: VercelResponse,
) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "GEMINI_API_KEY not set" });

  const { leader_name, limit: maxMeetings, force } = req.body || {};
  const cacheLeaderKey = leader_name || "__all__";

  // リーダー面談を抽出。leader_name 指定があれば consultant_name で絞り、無ければ is_leader=true のみ
  let query = db.from("meeting_transcripts")
    .select("*")
    .eq("is_leader", true)
    .order("recorded_at", { ascending: false })
    .limit(maxMeetings || 20);

  if (leader_name) {
    query = query.eq("consultant_name", leader_name);
  }

  const { data: meetings, error: queryError } = await query;
  if (queryError) {
    return res.status(500).json({ error: `面談取得失敗: ${queryError.message}` });
  }
  if (!meetings || meetings.length === 0) {
    return res.json({ playbook: [], source_meetings: 0, leader_name: leader_name || "全員", message: "リーダー面談がありません。/api/seed でサンプルを投入してください。" });
  }

  const cacheKey = computePlaybookCacheKey(meetings);

  // force=true でなければキャッシュヒットチェック
  if (!force) {
    try {
      const { data: cached } = await db
        .from("meeting_playbook_cache")
        .select("playbook, source_meeting_count, generated_at, cache_key")
        .eq("leader_name", cacheLeaderKey)
        .single();
      if (cached && cached.cache_key === cacheKey) {
        return res.json({
          playbook: cached.playbook,
          source_meetings: cached.source_meeting_count,
          leader_name: leader_name || "全員",
          cached: true,
          generated_at: cached.generated_at,
        });
      }
    } catch { /* テーブル未作成 / 行なし → ヒット無しと同じ扱い */ }
  }

  // 文字起こし優先で送る（要約より発話そのものから抽出した方が精度が高い）
  const transcriptSummaries = meetings.map((m, i) => {
    const body = (m.transcript_text as string)?.slice(0, 1200)
      || (m.summary as string)
      || (m.key_points as string[])?.join(", ")
      || "";
    return `[面談${i + 1}] ${m.title}\n${body}`;
  }).join("\n\n");

  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
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

  let playbook: unknown[] = [];
  try {
    // ```json ... ``` フェンス対策
    const cleaned = raw.replace(/```(?:json)?\s*([\s\S]*?)```/g, "$1");
    const jsonMatch = cleaned.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (Array.isArray(parsed)) playbook = parsed;
    }
  } catch {
    playbook = [];
  }

  // 生成成功時のみキャッシュに upsert (migration_005 で PK が id (UUID) になったので、conflict key を明示)
  if (playbook.length > 0) {
    try {
      await db.from("meeting_playbook_cache").upsert({
        leader_name: cacheLeaderKey,
        cache_key: cacheKey,
        playbook,
        source_meeting_count: meetings.length,
        generated_at: new Date().toISOString(),
      }, { onConflict: "leader_name" });
    } catch { /* テーブル未作成でも生成自体は成功させる */ }
  }

  return res.json({
    playbook,
    source_meetings: meetings.length,
    leader_name: leader_name || "全員",
    cached: false,
    ...(playbook.length === 0 ? { warning: "プレイブックを抽出できませんでした。面談記録の質・量を確認してください。" } : {}),
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
  if (!phase || phase < 1 || phase > 4) {
    return res.status(400).json({ error: "phase は 1〜4 で指定してください" });
  }

  // 文脈は取れたら使うが、無くてもフェーズ別の汎用コーチングを返せるようにする
  let candidateInfo = "";
  let companyInfo = "";
  let dealInfo = "";
  let pastMeetings = "";
  let leaderExamples = "";

  const safeSingle = async <T,>(p: PromiseLike<{ data: T | null; error: unknown }>): Promise<T | null> => {
    try { const { data } = await p; return data; } catch { return null; }
  };

  if (candidate_id) {
    const c = await safeSingle(db.from("candidates").select("*").eq("id", candidate_id).single());
    if (c) {
      const cand = c as Record<string, unknown>;
      candidateInfo = `候補者: ${cand.name}, 現職: ${cand.current_position || "不明"}, 年収: ${cand.current_salary || "不明"}万, 資格: ${(cand.qualifications as string[])?.join(",") || "不明"}, 希望: ${cand.desired_position || "不明"}, ステータス: ${cand.status}`;
    }
  }
  if (company_id) {
    const co = await safeSingle(db.from("companies").select("*").eq("id", company_id).single());
    if (co) {
      const c = co as Record<string, unknown>;
      companyInfo = `企業: ${c.name}, 業種: ${c.industry || "不明"}, 所在地: ${c.address || "不明"}`;
    }
  }
  if (deal_id) {
    const d = await safeSingle(db.from("deals").select("*").eq("id", deal_id).single());
    if (d) {
      const deal = d as Record<string, unknown>;
      dealInfo = `Deal: ${deal.title}, ステージ: ${deal.stage_name}, 滞在日数: ${deal.days_in_stage}日, 金額: ${deal.value}`;
    }
  }
  if (candidate_id || deal_id) {
    const mq = candidate_id
      ? db.from("meeting_transcripts").select("summary, key_points, action_items, recorded_at").eq("candidate_id", candidate_id).order("recorded_at", { ascending: false }).limit(3)
      : db.from("meeting_transcripts").select("summary, key_points, action_items, recorded_at").eq("deal_id", deal_id).order("recorded_at", { ascending: false }).limit(3);
    try {
      const { data: meetings } = await mq;
      if (meetings && meetings.length > 0) {
        pastMeetings = meetings.map((m, i) => {
          const summary = m.summary || (m.key_points as string[])?.slice(0, 3).join(" / ") || "（要約なし）";
          return `過去面談${i + 1} (${new Date(m.recorded_at).toLocaleDateString("ja-JP")}): ${summary}`;
        }).join("\n");
      }
    } catch { /* ignore */ }
  }

  // リーダーの最近の面談をプレイブック素材として注入（文脈が無い場合の強い手当て）
  try {
    const { data: leaderRows } = await db.from("meeting_transcripts")
      .select("title, transcript_text, summary")
      .eq("is_leader", true)
      .order("recorded_at", { ascending: false })
      .limit(5);
    if (leaderRows && leaderRows.length > 0) {
      leaderExamples = leaderRows.map((m, i) => {
        const body = (m.transcript_text as string)?.slice(0, 500) || m.summary || "";
        return `[リーダー事例${i + 1}] ${m.title}\n${body}`;
      }).join("\n\n");
    }
  } catch { /* ignore */ }

  const phaseGoals: Record<number, string> = {
    1: "仮説を立てる。候補者の転職動機を3パターン想定し、企業側の採用背景を理解する。マッチ求人を2-3件準備。",
    2: "本音を引き出す。「なぜ今転職か」の真因に迫る。年収・環境・キャリアの優先順位を確定。企業には候補者スペックを匿名で提示し、反応を見る。",
    3: "議事録を整理し、候補者の温度感を判定。企業へのフォロー（24時間以内）。次アクションを期限付きで設定。",
    4: "条件交渉をリード。候補者と企業の期待値ギャップを埋める。内定承諾までのタイムラインを管理。",
  };

  const contextProvided = !!(candidateInfo || companyInfo || dealInfo || pastMeetings);
  const contextSection = contextProvided
    ? `## 案件情報:
${candidateInfo || "（候補者情報なし）"}
${companyInfo || "（企業情報なし）"}
${dealInfo || "（Deal情報なし）"}

## 過去の面談履歴:
${pastMeetings || "（なし）"}`
    : `## 案件情報:
（指定なし — 候補者・企業・Deal が紐付いていないため、フェーズ${phase}の一般的なベストプラクティスとリーダー事例を元に指導してください）`;

  const prompt = `あなたは建築技術者専門の人材紹介のベテランリーダー（小林）です。
ジュニアコンサルタントがフェーズ${phase}で何をすべきか、この具体的な案件の文脈で指導してください。

## フェーズ${phase}の目的:
${phaseGoals[phase as number] || ""}

${contextSection}

## 現在の状況（コンサルタントの自己申告）:
${current_situation || "（特記事項なし）"}

## リーダーの過去面談（参考事例）:
${leaderExamples || "（事例なし）"}

## 回答形式（Markdown、見出しは ### で）:
### 今すぐやること
1. … （優先順位順に3つ、具体的アクション）
2. …
3. …

### 聞くべき質問
**候補者向け:**
- … （3つ、各質問の意図を一文で）

**企業向け:**
- … （3つ、各質問の意図を一文で）

### この案件のリスク
- … （2〜3個、よくある失敗パターン込み）

### リーダーならこう話す
> 「…」 （具体的セリフ、状況描写込みで2〜3文）

建築技術者の転職市場の実態（中堅ゼネコン・ハウスメーカー・デベ・CM の年収帯と動機）を踏まえてください。
案件情報が無い場合は仮定を明記し、汎用ベストプラクティスを示してください。`;

  // コーチングは出力短文・反復呼出し多めなので、高速・安価な flash-lite を使う。
  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`;
  const geminiRes = await fetch(geminiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 2048 },
    }),
  });

  if (!geminiRes.ok) {
    const errText = await geminiRes.text().catch(() => "");
    return res.status(502).json({ error: `Gemini API error: ${errText.slice(0, 300)}` });
  }

  const geminiData = await geminiRes.json();
  const coaching = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "";

  return res.json({
    phase,
    coaching,
    context: {
      candidateInfo,
      companyInfo,
      dealInfo,
      pastMeetings: pastMeetings ? "あり" : "なし",
      leaderExamples: leaderExamples ? "あり" : "なし",
      fallback: !contextProvided,
    },
  });
}

