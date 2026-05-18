import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createHash } from "node:crypto";
import { getSupabaseAdmin } from "../_lib/supabase-admin.js";
import { getRequestUser, isLeader, canReadMeeting, canWriteMeeting, send403 } from "../_lib/auth.js";
import { pickLearningResources } from "../_lib/learning-resources.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

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
    // --- /api/meetings/reseed-leader ---
    if (segments[0] === "reseed-leader" && req.method === "POST") {
      return await reseedLeaderMeetings(db, req, res);
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

// 小林本人のみ実行可能。既存のリーダー面談を全削除し、api/_data/leader-meetings-seed.json の 15 件で再投入する。
// シードデータが ~1MB あるため、必要な時だけ fs で読む (毎リクエストのバンドル肥大化を避ける)。
async function reseedLeaderMeetings(db: ReturnType<typeof getSupabaseAdmin>, req: VercelRequest, res: VercelResponse) {
  const user = getRequestUser(req);
  if (user !== "小林") return send403(res, "リーダー再シードは小林本人のみ実行可能です");

  // シードファイルを実行時に読み込む
  let seedRows: Array<{ title: string; candidate: string; recorded_at: string; transcript_text: string }>;
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const seedPath = join(here, "../_data/leader-meetings-seed.json");
    seedRows = JSON.parse(readFileSync(seedPath, "utf-8"));
  } catch (e) {
    return res.status(500).json({ error: `シードファイル読み込み失敗: ${(e as Error).message}` });
  }

  // 既存リーダー面談を全削除 (consultant_name=小林 AND is_leader=true)
  const { error: delErr, count: deletedCount } = await db
    .from("meeting_transcripts")
    .delete({ count: "exact" })
    .eq("consultant_name", "小林")
    .eq("is_leader", true);
  if (delErr) return res.status(500).json({ error: `削除失敗: ${delErr.message}` });

  // 新規 15 件を挿入
  const rows = seedRows.map((r) => ({
    consultant_name: "小林",
    is_leader: true,
    title: r.title,
    transcript_text: r.transcript_text,
    source: "manual",
    recorded_at: r.recorded_at,
  }));
  const { data: inserted, error: insErr } = await db
    .from("meeting_transcripts")
    .insert(rows)
    .select("id, title");
  if (insErr) return res.status(500).json({ error: `挿入失敗: ${insErr.message}` });

  return res.json({
    deleted: deletedCount ?? 0,
    inserted: inserted?.length ?? 0,
    titles: inserted?.map((r) => r.title) ?? [],
    note: "リーダータブから「一括採点する」を押すと Gemini で順次採点されます。",
  });
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

  // リーダー (=小林) の過去面談を「教師データ」として注入。
  // これにより Gemini の汎用判断ではなく "小林流の採点基準" でスコアリングされる。
  let leaderRefs = "";
  try {
    // 5 件のリーダー面談を取得し、各議事録の本文を 6000 字まで参照 (Gemini 100万 tokens 余裕)。
    const { data: leaderRows } = await db.from("meeting_transcripts")
      .select("title, transcript_text, score_data")
      .eq("is_leader", true)
      .order("recorded_at", { ascending: false })
      .limit(5);
    if (leaderRows && leaderRows.length > 0) {
      leaderRefs = leaderRows
        .map((r, i) => {
          const body = ((r.transcript_text as string) || "").slice(0, 6000);
          const score = r.score_data as { scores?: Record<string, number>; total?: number } | null;
          const scoreLine = score?.scores
            ? `[リーダー自己採点: needs ${score.scores.needs} / proposal ${score.scores.proposal} / trust ${score.scores.trust} / closing ${score.scores.closing} / intel ${score.scores.intel}]`
            : "";
          return `--- リーダー面談例 ${i + 1}: 「${r.title}」 ${scoreLine}\n${body}`;
        })
        .join("\n\n");
    }
  } catch { /* ignore */ }

  // リーダーが過去に他メンバー面談に残したコメント (leader_feedback) を学習材料として注入。
  // "リーダーはこの場面でこう指導している" を AI が踏まえて採点・改善案を出せるようにする。
  let leaderCoaching = "";
  try {
    const { data: feedbackRows } = await db.from("meeting_transcripts")
      .select("title, leader_feedback")
      .not("leader_feedback", "is", null)
      .order("updated_at", { ascending: false })
      .limit(5);
    if (feedbackRows && feedbackRows.length > 0) {
      leaderCoaching = feedbackRows
        .map((r, i) => `${i + 1}. 「${r.title}」へのリーダーコメント: ${(r.leader_feedback as string)?.slice(0, 200)}`)
        .join("\n");
    }
  } catch { /* ignore */ }

  // 採点入力ハッシュ。transcript_text + leaderRefs + leaderCoaching が同一なら Gemini を再呼び出ししない。
  const inputHash = createHash("sha256").update(`${text}\n---\n${leaderRefs}\n---\n${leaderCoaching}`).digest("hex");
  if (!opts.force && meeting.score_data && meeting.score_input_hash === inputHash) {
    return { meeting_id: id, cached: true, ...(meeting.score_data as Record<string, unknown>) };
  }

  // マルチモデル・フォールバック:
  // - 一番軽い flash-lite (無料枠に優しい) から試す
  // - 429/503 で失敗したら flash → 2.0-flash と切り替えて再試行
  // - 全モデルで失敗したら最終エラーを返す
  // - GEMINI_SCORING_MODEL 環境変数で先頭モデルを上書き可能
  // 主力は gemini-2.5-flash (構造化出力が安定)。
  // flash-lite は速いが反復ループしがちなので最終フォールバックに降格。
  const fallbackModels = (process.env.GEMINI_SCORING_MODEL
    ? [process.env.GEMINI_SCORING_MODEL, "gemini-2.5-flash", "gemini-2.0-flash", "gemini-2.5-flash-lite"]
    : ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-2.5-flash-lite"]
  ).filter((m, i, arr) => arr.indexOf(m) === i); // 重複除去

  const callGemini = async (): Promise<{ res: Response; model: string }> => {
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    let lastRes: Response | null = null;
    let lastModel = fallbackModels[0];
    for (const model of fallbackModels) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      // 各モデルで最大 2 回まで内部リトライ (503 は短時間で復旧することが多い)
      for (let attempt = 0; attempt < 2; attempt++) {
        lastRes = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: requestBody,
        });
        lastModel = model;
        if (lastRes.ok) return { res: lastRes, model };
        // 過負荷 (503/500) は短い待機で再試行
        if ((lastRes.status === 503 || lastRes.status === 500) && attempt === 0) {
          await sleep(1500);
          continue;
        }
        break; // 429 等、または 2 回目失敗なら次のモデルへ
      }
    }
    return { res: lastRes as Response, model: lastModel };
  };

  const requestBody = JSON.stringify({
      contents: [{ parts: [{ text: `建築技術者専門の人材紹介で、リーダー (小林) の面談スタイルを基準に、メンバーの面談を 5 軸で採点してください。各軸 0〜10 点の整数。

## 採点の基準 = リーダー (小林) の面談 (これに近いほど高得点)
${leaderRefs || "（リーダー面談データなし。汎用ベストプラクティスで採点）"}

${leaderCoaching ? `## リーダーが過去に残した指導コメント (採点・改善案でこの方針に揃えること)\n${leaderCoaching}\n` : ""}
## 採点対象 (メンバーの面談・最大25000字):
${text.slice(0, 25000)}

## 採点軸 (各 10 点満点・整数。リーダー面談での同軸の動きと比較して評価):
- needs: 候補者/企業の本音・課題を引き出せたか (リーダーは深掘り質問を 3 層以上重ねる)
- proposal: 具体的求人/候補者を提示し、マッチ理由を説明できたか (リーダーは企業名を出す)
- trust: 業界知識で専門家としての信頼を得られたか (リーダーは市場の実態を正直に伝える)
- closing: 期限付きの次アクション/コミットを得られたか (リーダーは具体日付を切る)
- intel: 他社状況・温度感・意思決定者を聞き出せたか (リーダーは他社エージェントの利用状況まで確認する)

## 厳守ルール:
1. **同じ文を絶対に繰り返さない**。1 観察 = 1 度だけ書く。
2. evidence は各軸 1 文・60 字以内で簡潔に書く。
3. improvements は 2 件・各 50 字以内。
4. key_moments は 2-3 件、面談記録から実際の発言をそのまま 60 字以内で抜き出す (改変禁止)。
5. JSON 1 オブジェクトのみ。前置きも結語も禁止。

## JSON 形式:
{
  "scores": { "needs": 7, "proposal": 5, "trust": 8, "closing": 4, "intel": 6 },
  "evidence": {
    "needs": "...",
    "proposal": "...",
    "trust": "...",
    "closing": "...",
    "intel": "..."
  },
  "improvements": ["改善点1", "改善点2"],
  "key_moments": [
    { "text": "面談記録からの実際の発言", "axis": "needs", "speaker": "コンサル" }
  ]
}` }] }],
      generationConfig: {
        temperature: 0.5,
        topP: 0.9,
        maxOutputTokens: 2048,
        responseMimeType: "application/json",
        // スキーマを最小限に絞る (フィールド多いと flash-lite が反復ループしやすいため)。
        // scores + evidence + improvements の 3 つだけ。それ以外は別フィードバック画面で生成。
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
            evidence: {
              type: "object",
              properties: {
                needs: { type: "string" },
                proposal: { type: "string" },
                trust: { type: "string" },
                closing: { type: "string" },
                intel: { type: "string" },
              },
              required: ["needs", "proposal", "trust", "closing", "intel"],
            },
            improvements: { type: "array", items: { type: "string" } },
            key_moments: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  text: { type: "string" },
                  axis: { type: "string" },
                  speaker: { type: "string" },
                },
                required: ["text", "axis"],
              },
            },
          },
          required: ["scores"],
        },
      },
  });

  const { res: geminiRes, model: usedModel } = await callGemini();

  if (!geminiRes.ok) {
    const errText = await geminiRes.text().catch(() => "");
    if (geminiRes.status === 429) {
      return {
        error: `全モデルでクォータ上限に到達 (最終試行: ${usedModel})。数分待って再試行するか、Google AI Studio で利用状況を確認してください。`,
        status: 429,
      };
    }
    if (geminiRes.status === 503) {
      return {
        error: `Gemini が現在混雑中で全モデル (flash-lite / flash / 2.0-flash) が応答していません。数分後にもう一度お試しください。`,
        status: 503,
      };
    }
    return { error: `Gemini API error (${usedModel}): ${errText.slice(0, 200)}`, status: 502 };
  }

  const geminiData = await geminiRes.json();
  const raw = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "";

  // LLM が出力する JSON にしばしば混入する不可視/全角文字を ASCII 相当に正規化。
  // - “” → "       (カーリーダブル引用符)
  // - ‘’ → '       (カーリーシングル引用符)
  // - ﻿  → 削除     (BOM)
  // - 　 → " "     (全角スペース)
  // - ，：；（）［］｛｝．→ ASCII (全角 JSON 構文文字)
  //   ※ 「、」「。」「「」」「『』」は文字列内容なので変換しない
  const normalizeJson = (s: string) =>
    s
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, "'")
      .replace(/﻿/g, "")
      .replace(/　/g, " ")
      .replace(/，/g, ",")
      .replace(/：/g, ":")
      .replace(/；/g, ";")
      .replace(/（/g, "(")
      .replace(/）/g, ")")
      .replace(/［/g, "[")
      .replace(/］/g, "]")
      .replace(/｛/g, "{")
      .replace(/｝/g, "}")
      .replace(/．/g, ".");

  // Gemini が同じフレーズを無限ループした場合、truncate された JSON を救うサルベージ機構。
  // 失敗時に少なくとも scores オブジェクトだけは正規表現で抜き出して採点だけは成立させる。
  const salvageScores = (s: string): Record<string, unknown> | null => {
    const m = s.match(/"scores"\s*:\s*\{([^}]+)\}/);
    if (!m) return null;
    const scoresBody = m[1];
    const scoreObj: Record<string, number> = {};
    const re = /"(needs|proposal|trust|closing|intel)"\s*:\s*(\d+)/g;
    let mm: RegExpExecArray | null;
    while ((mm = re.exec(scoresBody)) !== null) scoreObj[mm[1]] = parseInt(mm[2], 10);
    if (Object.keys(scoreObj).length !== 5) return null;
    return { scores: scoreObj, _salvaged: true };
  };

  let parsed: Record<string, unknown> = {};
  let parseError: string | null = null;
  try {
    const trimmed = normalizeJson(raw.trim());
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      const cleaned = trimmed.replace(/```(?:json)?\s*([\s\S]*?)```/g, "$1");
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          parsed = JSON.parse(jsonMatch[0]);
        } catch (e2) {
          // 完全な JSON は復旧できなくても、scores だけサルベージ可能ならそれで成立させる
          const salvaged = salvageScores(jsonMatch[0]);
          if (salvaged) {
            parsed = salvaged;
          } else {
            throw e2;
          }
        }
      } else {
        const salvaged = salvageScores(cleaned);
        if (salvaged) parsed = salvaged;
        else throw new Error("JSON が含まれていません");
      }
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

    // 弱い軸 2 つに合わせた静的学習リソース (Gemini に URL を出させずハルシネーション回避)。
    parsed.learning_resources = pickLearningResources(s);

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

