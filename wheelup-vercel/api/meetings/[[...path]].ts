import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getSupabaseAdmin } from "../_lib/supabase-admin.js";
import { guardRequest } from "../_lib/apiGuard.ts";
import { LLM_LIMIT, READ_LIMIT, WRITE_LIMIT } from "../_lib/ratelimit.ts";
import { checkLLMAllowed } from "../_lib/costGuard.ts";
import { GeminiError, geminiText } from "../_lib/gemini.ts";
import { extractJson, safeJsonParse } from "../_lib/json-extract.ts";
import { log, publicError } from "../_lib/logger.ts";
import type { SessionUser } from "../_lib/auth.ts";

/**
 * 統合 Meetings API（Gemini 文字起こし + AI要約 + 採点 + リーダーFB）
 *
 * すべてのルートは認証必須 (Supabase JWT または Bearer CRON_SECRET)、
 * 個別レート制限、Gemini 系は加えて KILL_LLM / 日次キャップ で保護される。
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const segments: string[] = Array.isArray(req.query.path)
    ? req.query.path
    : req.query.path
      ? [req.query.path as string]
      : [];

  // Route dispatch — guard inside each branch so the limit bucket is route-specific.
  try {
    if (segments.length === 0) {
      if (req.method === "GET") return await routeListTranscripts(req, res);
      if (req.method === "POST") return await routeCreateTranscript(req, res);
      return res.status(405).json({ error: "method_not_allowed" });
    }

    if (segments[0] === "transcribe" && req.method === "POST") {
      return await routeTranscribe(req, res);
    }
    if (segments[0] === "extract-playbook" && req.method === "POST") {
      return await routeExtractPlaybook(req, res);
    }
    if (segments[0] === "coach" && req.method === "POST") {
      return await routeContextualCoach(req, res);
    }

    const id = segments[0];
    const sub = segments[1] || "";

    if (!sub) {
      if (req.method === "GET") return await routeGetTranscript(id, req, res);
      if (req.method === "PUT") return await routeUpdateTranscript(id, req, res);
      if (req.method === "DELETE") return await routeDeleteTranscript(id, req, res);
      return res.status(405).json({ error: "method_not_allowed" });
    }

    if (sub === "summarize" && req.method === "POST") return await routeSummarize(id, req, res);
    if (sub === "score" && req.method === "POST") return await routeScore(id, req, res);
    if (sub === "rescore" && req.method === "POST") return await routeScore(id, req, res);
    if (sub === "leader-feedback" && req.method === "POST") return await routeAddLeaderFeedback(id, req, res);

    return res.status(404).json({ error: "not_found" });
  } catch (e) {
    // Final safety net — should never happen since each route guards itself.
    log.error("meetings_handler_unhandled", { err: publicError(e) });
    return res.status(500).json({ error: "internal_error" });
  }
}

/* ============================================================
 * Per-route handlers (guard + business logic)
 * ============================================================ */

async function routeListTranscripts(req: VercelRequest, res: VercelResponse) {
  const g = await guardRequest(req, res, { route: "meetings.list", limit: READ_LIMIT });
  if (g.deny) return;
  const { requestId } = g;

  const db = getSupabaseAdmin();
  const { deal_id, candidate_id, consultant_name, is_leader, limit } = req.query;
  const max = clampInt(limit, 100, 500, 1);

  let query = db.from("meeting_transcripts").select("*").order("recorded_at", { ascending: false }).limit(max);
  if (typeof deal_id === "string" && isUuid(deal_id)) query = query.eq("deal_id", deal_id);
  if (typeof candidate_id === "string" && isUuid(candidate_id)) query = query.eq("candidate_id", candidate_id);
  if (typeof consultant_name === "string" && consultant_name.length > 0 && consultant_name.length < 60) {
    query = query.eq("consultant_name", consultant_name);
  }
  if (is_leader === "true") query = query.eq("is_leader", true);
  if (is_leader === "false") query = query.eq("is_leader", false);

  const { data, error } = await query;
  if (error) {
    log.error("meetings_list_failed", { requestId, err: error.message });
    return res.status(500).json({ error: "list_failed" });
  }
  return res.json({ transcripts: data || [], total: (data || []).length });
}

async function routeCreateTranscript(req: VercelRequest, res: VercelResponse) {
  const g = await guardRequest(req, res, { route: "meetings.create", limit: WRITE_LIMIT });
  if (g.deny) return;
  const { requestId, user } = g;

  const b = (req.body || {}) as Record<string, unknown>;
  const title = clampStr(b.title, 200) || "面談記録";
  const transcript = clampStr(b.transcript_text, 100_000) || "";
  const dealId = optUuid(b.deal_id);
  const candidateId = optUuid(b.candidate_id);

  const willAutoScore = transcript.trim().length > 50;

  const db = getSupabaseAdmin();
  const insertRow = {
    deal_id: dealId,
    candidate_id: candidateId,
    consultant_name: clampStr(b.consultant_name, 60),
    is_leader: Boolean(b.is_leader),
    title,
    transcript_text: transcript,
    summary: clampStr(b.summary, 8000),
    action_items: Array.isArray(b.action_items) ? b.action_items.slice(0, 50) : [],
    key_points: Array.isArray(b.key_points) ? b.key_points.slice(0, 50) : [],
    next_steps: clampStr(b.next_steps, 4000),
    attendees: Array.isArray(b.attendees) ? b.attendees.slice(0, 20) : [],
    duration_minutes: optInt(b.duration_minutes, 0, 1440),
    source: clampStr(b.source, 32) || "manual",
    recorded_at: isIsoDate(b.recorded_at) ? (b.recorded_at as string) : new Date().toISOString(),
    score_status: willAutoScore ? "pending" : null,
    created_by: user?.email ?? null,
  };

  const { data, error } = await db.from("meeting_transcripts").insert(insertRow).select().single();
  if (error) {
    log.error("meetings_create_failed", { requestId, err: error.message });
    return res.status(500).json({ error: "create_failed" });
  }

  if (willAutoScore) {
    // Fire-and-track: scoreMeetingInternal records score_status updates in
    // the DB so the client can poll meaningfully. We still await to surface
    // a "scoring" → "scored"/"failed" transition before responding when
    // possible; if it exceeds 12s we let it finish in the background.
    const racing = new Promise<void>((resolve) => setTimeout(resolve, 12_000));
    await Promise.race([
      scoreMeetingInternal(data.id, requestId).then(() => undefined).catch(() => undefined),
      racing,
    ]);
  }

  return res.status(201).json({ ...data, auto_scoring: willAutoScore });
}

async function routeGetTranscript(id: string, req: VercelRequest, res: VercelResponse) {
  const g = await guardRequest(req, res, { route: "meetings.get", limit: READ_LIMIT });
  if (g.deny) return;
  if (!isUuid(id)) return res.status(400).json({ error: "invalid_id" });
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("meeting_transcripts").select("*").eq("id", id).single();
  if (error || !data) return res.status(404).json({ error: "not_found" });
  return res.json(data);
}

async function routeUpdateTranscript(id: string, req: VercelRequest, res: VercelResponse) {
  const g = await guardRequest(req, res, { route: "meetings.update", limit: WRITE_LIMIT });
  if (g.deny) return;
  const { requestId } = g;
  if (!isUuid(id)) return res.status(400).json({ error: "invalid_id" });

  const b = (req.body || {}) as Record<string, unknown>;
  const allowed = ["title", "transcript_text", "summary", "action_items", "key_points",
    "next_steps", "attendees", "duration_minutes", "deal_id", "candidate_id"];
  const updates: Record<string, unknown> = {};
  for (const f of allowed) {
    if (b[f] === undefined) continue;
    if (f === "title") updates[f] = clampStr(b[f], 200);
    else if (f === "transcript_text") updates[f] = clampStr(b[f], 100_000);
    else if (f === "summary") updates[f] = clampStr(b[f], 8000);
    else if (f === "next_steps") updates[f] = clampStr(b[f], 4000);
    else if (f === "deal_id" || f === "candidate_id") {
      updates[f] = optUuid(b[f]);
    } else if (f === "action_items" || f === "key_points") {
      updates[f] = Array.isArray(b[f]) ? (b[f] as unknown[]).slice(0, 50) : [];
    } else if (f === "attendees") {
      updates[f] = Array.isArray(b[f]) ? (b[f] as unknown[]).slice(0, 20) : [];
    } else if (f === "duration_minutes") {
      updates[f] = optInt(b[f], 0, 1440);
    }
  }

  const db = getSupabaseAdmin();
  const { data, error } = await db.from("meeting_transcripts").update(updates).eq("id", id).select().single();
  if (error) {
    log.error("meetings_update_failed", { requestId, id, err: error.message });
    return res.status(500).json({ error: "update_failed" });
  }
  return res.json(data);
}

async function routeDeleteTranscript(id: string, req: VercelRequest, res: VercelResponse) {
  const g = await guardRequest(req, res, { route: "meetings.delete", limit: WRITE_LIMIT });
  if (g.deny) return;
  const { requestId } = g;
  if (!isUuid(id)) return res.status(400).json({ error: "invalid_id" });
  const db = getSupabaseAdmin();
  const { error } = await db.from("meeting_transcripts").delete().eq("id", id);
  if (error) {
    log.error("meetings_delete_failed", { requestId, id, err: error.message });
    return res.status(500).json({ error: "delete_failed" });
  }
  return res.json({ deleted: true });
}

async function routeTranscribe(req: VercelRequest, res: VercelResponse) {
  const g = await guardRequest(req, res, { route: "meetings.transcribe", limit: LLM_LIMIT });
  if (g.deny) return;
  const { requestId, user } = g;

  const cost = await checkLLMAllowed();
  if (!cost.ok) {
    log.warn("llm_blocked", { route: "meetings.transcribe", requestId, reason: cost.reason });
    return res.status(cost.status).json({ error: cost.message });
  }

  const b = (req.body || {}) as Record<string, unknown>;
  const audioBase64 = typeof b.audio_base64 === "string" ? b.audio_base64 : "";
  if (!audioBase64) return res.status(400).json({ error: "audio_base64_required" });

  // 10 MB cap on the encoded payload. Base64 expands by ~4/3, so decoded
  // audio is ~7.5 MB max. Long-form audio should be uploaded to storage
  // and referenced — that work is out of scope.
  const MAX_BASE64_BYTES = 10 * 1024 * 1024;
  if (audioBase64.length > MAX_BASE64_BYTES) {
    return res.status(413).json({ error: "audio_too_large", max_bytes: MAX_BASE64_BYTES });
  }

  const mimeType = clampStr(b.mime_type, 80) || "audio/webm";
  if (!/^audio\//i.test(mimeType) && !/^video\//i.test(mimeType)) {
    return res.status(400).json({ error: "unsupported_mime_type" });
  }

  let text: string;
  try {
    text = await geminiText({
      model: "gemini-2.0-flash",
      temperature: 0.1,
      maxOutputTokens: 8192,
      inlineData: [{ mime_type: mimeType, data: audioBase64 }],
      text: `この音声は人材紹介の面談録音です。以下の形式で文字起こしと分析を行ってください。

## 文字起こし
話者を区別しながら、会話内容を忠実に文字起こししてください。

## 要点
- 箇条書きで重要なポイントを5-10個

## アクションアイテム
- 具体的な次のアクションを箇条書き

## 候補者の本音・ニーズ
- 発言から読み取れる転職動機、不満、希望を分析`,
    });
  } catch (e) {
    if (e instanceof GeminiError) {
      log.error("transcribe_gemini_failed", { requestId, status: e.status, retryable: e.retryable });
      return res.status(e.status >= 500 ? 502 : 400).json({ error: "gemini_failed" });
    }
    log.error("transcribe_failed", { requestId, err: publicError(e) });
    return res.status(500).json({ error: "transcribe_failed" });
  }

  const sections = parseGeminiOutput(text);
  const db = getSupabaseAdmin();
  const { data, error } = await db.from("meeting_transcripts").insert({
    deal_id: optUuid(b.deal_id),
    candidate_id: optUuid(b.candidate_id),
    consultant_name: clampStr(b.consultant_name, 60),
    is_leader: Boolean(b.is_leader),
    title: clampStr(b.title, 200) || "Gemini 文字起こし",
    transcript_text: sections.transcript,
    summary: sections.summary,
    action_items: sections.actionItems,
    key_points: sections.keyPoints,
    next_steps: sections.actionItems.join("\n"),
    attendees: Array.isArray(b.attendees) ? (b.attendees as unknown[]).slice(0, 20) : [],
    source: "gemini",
    recorded_at: new Date().toISOString(),
    score_status: "pending",
    created_by: user?.email ?? null,
  }).select().single();

  if (error) {
    log.error("transcribe_insert_failed", { requestId, err: error.message });
    return res.status(500).json({ error: "insert_failed" });
  }

  // Race scoring like createTranscript does.
  const racing = new Promise<void>((resolve) => setTimeout(resolve, 12_000));
  await Promise.race([
    scoreMeetingInternal(data.id, requestId).then(() => undefined).catch(() => undefined),
    racing,
  ]);

  return res.json({ transcript: data, auto_scoring: true });
}

async function routeSummarize(id: string, req: VercelRequest, res: VercelResponse) {
  const g = await guardRequest(req, res, { route: "meetings.summarize", limit: LLM_LIMIT });
  if (g.deny) return;
  const { requestId } = g;
  if (!isUuid(id)) return res.status(400).json({ error: "invalid_id" });

  const cost = await checkLLMAllowed();
  if (!cost.ok) return res.status(cost.status).json({ error: cost.message });

  const db = getSupabaseAdmin();
  const { data: meeting, error } = await db.from("meeting_transcripts").select("*").eq("id", id).single();
  if (error || !meeting) return res.status(404).json({ error: "not_found" });

  const text = (meeting.transcript_text as string) || "";
  if (!text) return res.status(400).json({ error: "no_transcript_text" });

  let raw: string;
  try {
    raw = await geminiText({
      model: "gemini-2.0-flash",
      temperature: 0.2,
      maxOutputTokens: 4096,
      text: `以下は人材紹介の面談議事録です。要約・分析してください。

${text.slice(0, 10_000)}

以下の形式で出力:
## 要約（3-5行）
## 要点（箇条書き5-10個）
## アクションアイテム（箇条書き）
## 候補者の本音・ニーズ分析`,
    });
  } catch (e) {
    if (e instanceof GeminiError) {
      log.error("summarize_gemini_failed", { requestId, id, status: e.status });
      return res.status(502).json({ error: "gemini_failed" });
    }
    log.error("summarize_failed", { requestId, id, err: publicError(e) });
    return res.status(500).json({ error: "summarize_failed" });
  }

  const sections = parseGeminiOutput(raw);
  await db.from("meeting_transcripts").update({
    summary: sections.summary,
    action_items: sections.actionItems,
    key_points: sections.keyPoints,
    next_steps: sections.actionItems.join("\n"),
  }).eq("id", id);

  return res.json({ summary: sections.summary, action_items: sections.actionItems, key_points: sections.keyPoints });
}

async function routeScore(id: string, req: VercelRequest, res: VercelResponse) {
  const g = await guardRequest(req, res, { route: "meetings.score", limit: LLM_LIMIT });
  if (g.deny) return;
  const { requestId } = g;
  if (!isUuid(id)) return res.status(400).json({ error: "invalid_id" });

  const cost = await checkLLMAllowed();
  if (!cost.ok) return res.status(cost.status).json({ error: cost.message });

  const result = await scoreMeetingInternal(id, requestId);
  if ("error" in result) {
    return res.status((result.status as number) || 500).json({ error: result.error });
  }
  return res.json(result);
}

async function routeAddLeaderFeedback(id: string, req: VercelRequest, res: VercelResponse) {
  const g = await guardRequest(req, res, { route: "meetings.leader_feedback", limit: WRITE_LIMIT });
  if (g.deny) return;
  const { requestId, user } = g;
  if (!isUuid(id)) return res.status(400).json({ error: "invalid_id" });

  const feedback = clampStr((req.body || {}).feedback, 8000);
  if (!feedback || !feedback.trim()) {
    return res.status(400).json({ error: "feedback_required" });
  }

  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("meeting_transcripts")
    .update({ leader_feedback: feedback.trim() })
    .eq("id", id)
    .select()
    .single();
  if (error) {
    log.error("leader_feedback_failed", { requestId, id, by: user?.email, err: error.message });
    return res.status(500).json({ error: "update_failed" });
  }
  return res.json(data);
}

async function routeExtractPlaybook(req: VercelRequest, res: VercelResponse) {
  const g = await guardRequest(req, res, { route: "meetings.extract_playbook", limit: LLM_LIMIT });
  if (g.deny) return;
  const { requestId } = g;

  const cost = await checkLLMAllowed();
  if (!cost.ok) return res.status(cost.status).json({ error: cost.message });

  const b = (req.body || {}) as Record<string, unknown>;
  const leaderName = clampStr(b.leader_name, 60);
  const maxMeetings = optInt(b.limit, 1, 50) ?? 20;

  const db = getSupabaseAdmin();
  let query = db.from("meeting_transcripts")
    .select("*")
    .order("recorded_at", { ascending: false })
    .limit(maxMeetings);
  if (leaderName) query = query.contains("attendees", [leaderName]);

  const { data: meetings } = await query;
  if (!meetings || meetings.length === 0) {
    return res.json({ playbook: [], message: "面談記録がありません" });
  }

  const summaries = meetings.map((m, i) =>
    `[面談${i + 1}] ${m.title}\n要約: ${m.summary || "なし"}\n要点: ${(m.key_points as string[])?.join(", ") || "なし"}\nアクション: ${(m.action_items as string[])?.join(", ") || "なし"}`,
  ).join("\n\n");

  let raw: string;
  try {
    raw = await geminiText({
      model: "gemini-2.0-flash",
      temperature: 0.3,
      maxOutputTokens: 4096,
      text: `あなたは建築技術者専門の人材紹介のセールスコーチです。
以下はリーダーの面談記録${meetings.length}件です。パターンを分析し、状況別プレイブックを生成してください。

${summaries.slice(0, 8000)}

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

建築技術者の転職市場を踏まえて、最低8つの状況をカバーしてください。`,
    });
  } catch (e) {
    if (e instanceof GeminiError) {
      log.error("playbook_gemini_failed", { requestId, status: e.status });
      return res.status(502).json({ error: "gemini_failed" });
    }
    log.error("playbook_failed", { requestId, err: publicError(e) });
    return res.status(500).json({ error: "playbook_failed" });
  }

  const parsed = safeJsonParse<unknown[]>(extractJson(raw));
  const playbook = parsed.ok && Array.isArray(parsed.value) ? parsed.value : [];

  return res.json({
    playbook,
    source_meetings: meetings.length,
    leader_name: leaderName || "全員",
  });
}

async function routeContextualCoach(req: VercelRequest, res: VercelResponse) {
  const g = await guardRequest(req, res, { route: "meetings.coach", limit: LLM_LIMIT });
  if (g.deny) return;
  const { requestId } = g;

  const cost = await checkLLMAllowed();
  if (!cost.ok) return res.status(cost.status).json({ error: cost.message });

  const b = (req.body || {}) as Record<string, unknown>;
  const phase = optInt(b.phase, 1, 4);
  if (!phase) return res.status(400).json({ error: "phase_required_1_to_4" });

  const candidateId = optUuid(b.candidate_id);
  const companyId = optUuid(b.company_id);
  const dealId = optUuid(b.deal_id);
  const currentSituation = clampStr(b.current_situation, 2000);

  const db = getSupabaseAdmin();
  let candidateInfo = "";
  let companyInfo = "";
  let dealInfo = "";
  let pastMeetings = "";

  if (candidateId) {
    const { data: c } = await db.from("candidates").select("*").eq("id", candidateId).single();
    if (c) candidateInfo = `候補者: ${c.name}, 現職: ${c.current_position || "不明"}, 年収: ${c.current_salary || "不明"}万, 資格: ${(c.qualifications as string[])?.join(",") || "不明"}, 希望: ${c.desired_position || "不明"}, ステータス: ${c.status}`;
  }
  if (companyId) {
    const { data: co } = await db.from("companies").select("*").eq("id", companyId).single();
    if (co) companyInfo = `企業: ${co.name}, 業種: ${co.industry || "不明"}, 所在地: ${co.address || "不明"}`;
  }
  if (dealId) {
    const { data: d } = await db.from("deals").select("*").eq("id", dealId).single();
    if (d) dealInfo = `Deal: ${d.title}, ステージ: ${d.stage_name}, 滞在日数: ${d.days_in_stage}日, 金額: ${d.value}`;
  }
  if (candidateId || dealId) {
    const mq = candidateId
      ? db.from("meeting_transcripts").select("summary, key_points, action_items").eq("candidate_id", candidateId).order("recorded_at", { ascending: false }).limit(3)
      : db.from("meeting_transcripts").select("summary, key_points, action_items").eq("deal_id", dealId!).order("recorded_at", { ascending: false }).limit(3);
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

  let coaching: string;
  try {
    coaching = await geminiText({
      model: "gemini-2.0-flash",
      temperature: 0.3,
      maxOutputTokens: 2048,
      text: `あなたは建築技術者専門の人材紹介のベテランリーダーです。
ジュニアコンサルタントがフェーズ${phase}で何をすべきか、この具体的な案件の文脈で指導してください。

## フェーズ${phase}の目的:
${phaseGoals[phase] || ""}

## 案件情報:
${candidateInfo || "候補者情報なし"}
${companyInfo || "企業情報なし"}
${dealInfo || "Deal情報なし"}

## 過去の面談履歴:
${pastMeetings || "なし"}

## 現在の状況:
${currentSituation || "特記事項なし"}

## 回答形式:
1. **今すぐやること**（具体的なアクション3つ、優先順位付き）
2. **この案件で聞くべき質問**（候補者向け/企業向け各3つ、なぜその質問が重要か含む）
3. **注意点**（この案件特有のリスク、よくある失敗パターン）
4. **リーダーならこう話す**（具体的なセリフ例1つ）`,
    });
  } catch (e) {
    if (e instanceof GeminiError) {
      log.error("coach_gemini_failed", { requestId, status: e.status });
      return res.status(502).json({ error: "gemini_failed" });
    }
    log.error("coach_failed", { requestId, err: publicError(e) });
    return res.status(500).json({ error: "coach_failed" });
  }

  return res.json({
    phase,
    coaching,
    context: { candidateInfo, companyInfo, dealInfo, pastMeetings: pastMeetings ? "あり" : "なし" },
  });
}

/* ============================================================
 * Internal: scoring with persisted status
 * ============================================================ */

interface ScoreSuccess {
  meeting_id: string;
  scores: { needs: number; proposal: number; trust: number; closing: number; intel: number };
  total: number;
  grade: string;
  evidence?: Record<string, string>;
  strengths: string[];
  improvements: string[];
  leader_would?: string;
}
type ScoreFailure = { error: string; status: number };

async function scoreMeetingInternal(id: string, requestId: string): Promise<ScoreSuccess | ScoreFailure> {
  const db = getSupabaseAdmin();
  // Mark as in-progress so the client sees movement.
  await db.from("meeting_transcripts")
    .update({ score_status: "scoring", score_error: null })
    .eq("id", id);

  const { data: meeting } = await db.from("meeting_transcripts").select("*").eq("id", id).single();
  if (!meeting) {
    return { error: "not_found", status: 404 };
  }
  const text = (meeting.transcript_text as string) || (meeting.summary as string) || "";
  if (!text) {
    await db.from("meeting_transcripts")
      .update({ score_status: "failed", score_error: "no_text" })
      .eq("id", id);
    return { error: "no_text", status: 400 };
  }

  let raw: string;
  try {
    raw = await geminiText({
      model: "gemini-2.0-flash",
      temperature: 0.3,
      maxOutputTokens: 2048,
      text: `あなたは建築技術者専門の人材紹介会社のセールスコーチです。
以下の面談記録を5つの観点で10点満点で採点してください。
**必ず各スコアの根拠として、面談記録からの具体的な引用（発言）を付けてください。**

## 面談記録:
${text.slice(0, 6000)}

## 採点基準（各10点）:
1. **ニーズ深掘り(needs)**
2. **提案力(proposal)**
3. **信頼構築(trust)**
4. **クロージング(closing)**
5. **情報収集(intel)**

## 出力形式（JSON厳守、説明文や \`\`\` フェンスは不要）:
{
  "scores": { "needs": 7, "proposal": 5, "trust": 8, "closing": 4, "intel": 6 },
  "total": 30,
  "grade": "B",
  "evidence": {
    "needs": "「〇〇さんが本当に求めているのは…」と深掘りできている",
    "proposal": "具体的な求人提示がなく、一般論にとどまった",
    "trust": "「施工管理の現場では…」と業界知識を交えて話せている",
    "closing": "「来週までに…」と期限を切れていない",
    "intel": "他社選考状況を聞き出せた"
  },
  "strengths": ["強み1", "強み2"],
  "improvements": ["改善点1", "改善点2"],
  "leader_would": "リーダーならこの場面でこう話す、というセリフ"
}`,
    });
  } catch (e) {
    const status = e instanceof GeminiError ? e.status : 500;
    log.error("score_gemini_failed", { requestId, id, status });
    await db.from("meeting_transcripts").update({
      score_status: "failed",
      score_error: `gemini_${status}`,
      score_attempts: (meeting.score_attempts ?? 0) + 1,
    }).eq("id", id);
    return { error: "gemini_failed", status: 502 };
  }

  const parsed = safeJsonParse<Record<string, unknown>>(extractJson(raw));
  if (!parsed.ok) {
    log.error("score_parse_failed", { requestId, id });
    await db.from("meeting_transcripts").update({
      score_status: "failed",
      score_error: `parse: ${parsed.error.slice(0, 80)}`,
      score_attempts: (meeting.score_attempts ?? 0) + 1,
    }).eq("id", id);
    return { error: "score_parse_failed", status: 502 };
  }

  const v = parsed.value;
  const scores = (v.scores ?? {}) as Record<string, number>;
  const normalized: ScoreSuccess = {
    meeting_id: id,
    scores: {
      needs: clamp10(scores.needs),
      proposal: clamp10(scores.proposal),
      trust: clamp10(scores.trust),
      closing: clamp10(scores.closing),
      intel: clamp10(scores.intel),
    },
    total: 0,
    grade: typeof v.grade === "string" ? v.grade.slice(0, 4) : "—",
    evidence: typeof v.evidence === "object" && v.evidence ? (v.evidence as Record<string, string>) : undefined,
    strengths: Array.isArray(v.strengths) ? (v.strengths as unknown[]).filter((s) => typeof s === "string").slice(0, 8) as string[] : [],
    improvements: Array.isArray(v.improvements) ? (v.improvements as unknown[]).filter((s) => typeof s === "string").slice(0, 8) as string[] : [],
    leader_would: typeof v.leader_would === "string" ? (v.leader_would as string).slice(0, 1000) : undefined,
  };
  normalized.total = normalized.scores.needs + normalized.scores.proposal + normalized.scores.trust +
    normalized.scores.closing + normalized.scores.intel;

  await db.from("meeting_transcripts").update({
    score_data: normalized,
    score_status: "scored",
    score_error: null,
    score_attempts: (meeting.score_attempts ?? 0) + 1,
  }).eq("id", id);

  return normalized;
}

/* ============================================================
 * Pure helpers
 * ============================================================ */

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}
function optUuid(v: unknown): string | null {
  if (v == null || v === "") return null;
  return isUuid(v) ? v : null;
}

function clampStr(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  return v.slice(0, max);
}
function clampInt(v: unknown, def: number, max: number, min = 0): number {
  if (v == null || v === "") return def;
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.max(min, Math.min(max, Math.floor(n)));
}
function optInt(v: unknown, min: number, max: number): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.max(min, Math.min(max, Math.floor(n)));
}
function clamp10(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(10, Math.round(n)));
}
function isIsoDate(v: unknown): boolean {
  return typeof v === "string" && !Number.isNaN(Date.parse(v));
}

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
  return match && match[1] ? match[1].trim() : "";
}
function parseBullets(text: string): string[] {
  return text.split("\n")
    .map((line) => line.replace(/^[-*・]\s*/, "").trim())
    .filter(Boolean);
}

// Suppress unused import warning — kept for future expansion.
void (null as unknown as SessionUser);
