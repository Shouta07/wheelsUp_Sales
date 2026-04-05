import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getSupabaseAdmin } from "../_lib/supabase-admin.js";

/**
 * 統合 Lark API
 *
 * POST   /api/lark/webhook     → Lark Event Callback 受信
 * GET    /api/lark/messages     → メッセージ検索
 * POST   /api/lark/link-deal    → チャンネル↔案件紐付け
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const db = getSupabaseAdmin();
  const segments: string[] = Array.isArray(req.query.path)
    ? req.query.path
    : req.query.path ? [req.query.path] : [];

  // --- /api/lark/webhook ---
  if (segments[0] === "webhook" && req.method === "POST") {
    return await handleWebhook(db, req, res);
  }
  // --- /api/lark/messages ---
  if (segments[0] === "messages" && req.method === "GET") {
    return await searchMessages(db, req, res);
  }
  // --- /api/lark/link-deal ---
  if (segments[0] === "link-deal" && req.method === "POST") {
    return await linkDeal(db, req, res);
  }

  return res.status(404).json({ error: "Not found" });
}

/**
 * Lark Event Subscription Callback
 * https://open.larksuite.com/document/server-docs/event-subscription-guide/event-subscription-configure-/request-url-configuration-case
 */
async function handleWebhook(db: ReturnType<typeof getSupabaseAdmin>, req: VercelRequest, res: VercelResponse) {
  const body = req.body;

  // 1. URL検証チャレンジ（初回設定時）
  if (body.type === "url_verification") {
    return res.json({ challenge: body.challenge });
  }

  // 2. Event Callback v2
  const header = body.header;
  const event = body.event;

  if (!header || !event) {
    return res.status(400).json({ error: "Invalid event format" });
  }

  // Verification Token チェック
  const verificationToken = process.env.LARK_VERIFICATION_TOKEN;
  if (verificationToken && header.token !== verificationToken) {
    return res.status(403).json({ error: "Invalid verification token" });
  }

  const eventType = header.event_type;

  // メッセージ受信イベント
  if (eventType === "im.message.receive_v1") {
    const msg = event.message;
    const sender = event.sender;

    if (!msg || !msg.message_id) {
      return res.json({ ok: true, skipped: "no message" });
    }

    // テキストメッセージのみ処理
    let content = "";
    if (msg.message_type === "text") {
      try {
        const parsed = JSON.parse(msg.content);
        content = parsed.text || "";
      } catch {
        content = msg.content || "";
      }
    } else {
      return res.json({ ok: true, skipped: "non-text message" });
    }

    if (!content.trim()) {
      return res.json({ ok: true, skipped: "empty content" });
    }

    // メッセージ保存
    const { error } = await db.from("messages").upsert({
      lark_message_id: msg.message_id,
      chat_id: msg.chat_id,
      chat_type: msg.chat_type || "group",
      sender_id: sender?.sender_id?.user_id || sender?.sender_id?.open_id || "",
      sender_name: sender?.sender_id?.name || "",
      content,
      created_at: msg.create_time
        ? new Date(parseInt(msg.create_time)).toISOString()
        : new Date().toISOString(),
    }, { onConflict: "lark_message_id" });

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    // チャンネル↔案件マッピングがあれば pipedrive_deal_id をチャンクに記録
    let dealId: number | null = null;
    const { data: mapping } = await db.from("channel_deal_mapping")
      .select("pipedrive_deal_id")
      .eq("chat_id", msg.chat_id)
      .maybeSingle();
    if (mapping) dealId = mapping.pipedrive_deal_id;

    // チャンク化（簡易: メッセージ全文を1チャンク）
    // NOTE: 本番では OpenAI Embedding API で embedding を生成する
    const { data: savedMsg } = await db.from("messages")
      .select("id")
      .eq("lark_message_id", msg.message_id)
      .single();

    if (savedMsg) {
      await db.from("chunks").insert({
        message_id: savedMsg.id,
        chunk_text: content,
        chunk_index: 0,
        pipedrive_deal_id: dealId,
        // embedding は別途バッチ処理で生成
      });
    }

    return res.json({ ok: true, saved: true });
  }

  // その他のイベントは無視
  return res.json({ ok: true, event_type: eventType });
}

async function searchMessages(db: ReturnType<typeof getSupabaseAdmin>, req: VercelRequest, res: VercelResponse) {
  const { q, chat_id, deal_id, limit: limitStr } = req.query;
  const limit = parseInt((limitStr as string) || "50");

  let query = db.from("messages")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (q && typeof q === "string") {
    query = query.ilike("content", `%${q}%`);
  }
  if (chat_id && typeof chat_id === "string") {
    query = query.eq("chat_id", chat_id);
  }
  if (deal_id && typeof deal_id === "string") {
    // deal_id でフィルタ: channel_deal_mapping 経由
    const { data: mappings } = await db.from("channel_deal_mapping")
      .select("chat_id")
      .eq("pipedrive_deal_id", parseInt(deal_id));
    if (mappings && mappings.length > 0) {
      const chatIds = mappings.map((m) => m.chat_id);
      query = query.in("chat_id", chatIds);
    } else {
      return res.json({ messages: [], total: 0 });
    }
  }

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });

  return res.json({ messages: data || [], total: (data || []).length });
}

async function linkDeal(db: ReturnType<typeof getSupabaseAdmin>, req: VercelRequest, res: VercelResponse) {
  const { chat_id, pipedrive_deal_id } = req.body;
  if (!chat_id || !pipedrive_deal_id) {
    return res.status(400).json({ error: "chat_id と pipedrive_deal_id が必要です" });
  }

  const { data, error } = await db.from("channel_deal_mapping").upsert({
    chat_id,
    pipedrive_deal_id,
  }).select().single();

  if (error) return res.status(500).json({ error: error.message });
  return res.json(data);
}
