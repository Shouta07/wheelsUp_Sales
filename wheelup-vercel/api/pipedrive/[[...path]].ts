import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getSupabaseAdmin } from "../_lib/supabase-admin.js";

/**
 * 統合 Pipedrive API
 *
 * POST   /api/pipedrive/sync/deals       → Deal 全件同期
 * POST   /api/pipedrive/sync/activities   → Activity 同期
 * POST   /api/pipedrive/sync/persons      → Person → candidates 同期
 * GET    /api/pipedrive/deals             → 案件一覧（ステージ別）
 * GET    /api/pipedrive/deals/:id         → 案件詳細（Activity付き）
 * GET    /api/pipedrive/stale             → 停滞案件アラート
 * GET    /api/pipedrive/pipeline          → パイプライン統計
 * GET    /api/pipedrive/gamification      → コンサルタント別ゲーミフィケーション指標
 * POST   /api/pipedrive/coaching          → AI コーチングフィードバック生成
 */

const PD_BASE = "https://api.pipedrive.com/v1";

function getToken() {
  const t = process.env.PIPEDRIVE_API_TOKEN;
  if (!t) throw new Error("PIPEDRIVE_API_TOKEN not set");
  return t;
}

async function pdGet(path: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${PD_BASE}${path}${path.includes("?") ? "&" : "?"}api_token=${getToken()}`);
  return res.json();
}

async function pdGetAll(path: string): Promise<Array<Record<string, unknown>>> {
  const items: Array<Record<string, unknown>> = [];
  let start = 0;
  const limit = 100;
  while (true) {
    const sep = path.includes("?") ? "&" : "?";
    const json = await pdGet(`${path}${sep}start=${start}&limit=${limit}`);
    items.push(...((json.data as Array<Record<string, unknown>>) || []));
    const more = (json.additional_data as Record<string, unknown>)?.pagination as Record<string, unknown>;
    if (!more?.more_items_in_collection) break;
    start = (more.next_start as number) || start + limit;
  }
  return items;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const db = getSupabaseAdmin();
  const segments: string[] = Array.isArray(req.query.path)
    ? req.query.path
    : req.query.path ? [req.query.path] : [];

  try {
    // --- /api/pipedrive/sync/deals ---
    if (segments[0] === "sync" && segments[1] === "deals" && req.method === "POST") {
      return await syncDeals(db, res);
    }
    // --- /api/pipedrive/sync/activities ---
    if (segments[0] === "sync" && segments[1] === "activities" && req.method === "POST") {
      return await syncActivities(db, res);
    }
    // --- /api/pipedrive/sync/persons ---
    if (segments[0] === "sync" && segments[1] === "persons" && req.method === "POST") {
      return await syncPersons(db, res);
    }
    // --- /api/pipedrive/deals ---
    if (segments[0] === "deals" && !segments[1] && req.method === "GET") {
      return await listDeals(db, req, res);
    }
    // --- /api/pipedrive/deals/:id ---
    if (segments[0] === "deals" && segments[1] && req.method === "GET") {
      return await getDeal(db, segments[1], res);
    }
    // --- /api/pipedrive/stale ---
    if (segments[0] === "stale" && req.method === "GET") {
      return await staleDeals(db, req, res);
    }
    // --- /api/pipedrive/pipeline ---
    if (segments[0] === "pipeline" && req.method === "GET") {
      return await pipelineStats(db, res);
    }
    // --- /api/pipedrive/gamification ---
    if (segments[0] === "gamification" && req.method === "GET") {
      return await gamificationMetrics(db, req, res);
    }
    // --- /api/pipedrive/coaching ---
    if (segments[0] === "coaching" && req.method === "POST") {
      return await generateCoaching(db, req, res);
    }

    return res.status(404).json({ error: "Not found" });
  } catch (e) {
    return res.status(500).json({ error: (e as Error).message });
  }
}

/* ========== Sync Functions ========== */

async function syncDeals(db: ReturnType<typeof getSupabaseAdmin>, res: VercelResponse) {
  // パイプライン・ステージ名を取得
  const stageMap = new Map<number, { name: string; order: number; pipeline_name: string }>();
  const pipelines = await pdGetAll("/pipelines");
  for (const pl of pipelines) {
    const stages = await pdGetAll(`/stages?pipeline_id=${pl.id}`);
    for (const s of stages) {
      stageMap.set(s.id as number, {
        name: s.name as string,
        order: s.order_nr as number,
        pipeline_name: pl.name as string,
      });
    }
  }

  const deals = await pdGetAll("/deals?status=all_not_deleted");
  let count = 0;

  for (const d of deals) {
    const dealId = d.id as number;
    if (!dealId) continue;

    const stageInfo = stageMap.get(d.stage_id as number);

    // candidates テーブルで pipedrive_person_id を検索
    let candidateId: string | null = null;
    if (d.person_id) {
      const pid = typeof d.person_id === "object" ? (d.person_id as Record<string, unknown>).value : d.person_id;
      const { data: cand } = await db.from("candidates").select("id").eq("pipedrive_person_id", pid).maybeSingle();
      if (cand) candidateId = cand.id;
    }

    // companies テーブルで pipedrive_org_id を検索
    let companyId: string | null = null;
    if (d.org_id) {
      const oid = typeof d.org_id === "object" ? (d.org_id as Record<string, unknown>).value : d.org_id;
      const { data: comp } = await db.from("companies").select("id").eq("pipedrive_org_id", oid).maybeSingle();
      if (comp) companyId = comp.id;
    }

    const personName = d.person_id && typeof d.person_id === "object"
      ? (d.person_id as Record<string, unknown>).name as string
      : "";
    const orgName = d.org_id && typeof d.org_id === "object"
      ? (d.org_id as Record<string, unknown>).name as string
      : "";

    // ステージ滞在日数を計算
    const stageChangeTime = d.stage_change_time as string | null;
    let daysInStage = 0;
    if (stageChangeTime) {
      daysInStage = Math.floor((Date.now() - new Date(stageChangeTime).getTime()) / 86400000);
    }

    const ownerName = d.owner_name as string
      || (d.user_id && typeof d.user_id === "object" ? (d.user_id as Record<string, unknown>).name as string : "");

    await db.from("deals").upsert({
      pipedrive_deal_id: dealId,
      title: (d.title as string) || "",
      value: (d.value as number) || 0,
      currency: (d.currency as string) || "JPY",
      pipeline_id: d.pipeline_id as number,
      pipeline_name: stageInfo?.pipeline_name || "",
      stage_id: d.stage_id as number,
      stage_name: stageInfo?.name || "",
      stage_order: stageInfo?.order || 0,
      status: (d.status as string) || "open",
      person_name: personName,
      org_name: orgName,
      candidate_id: candidateId,
      company_id: companyId,
      expected_close_date: d.expected_close_date || null,
      won_time: d.won_time || null,
      lost_time: d.lost_time || null,
      lost_reason: d.lost_reason || null,
      stage_entered_at: stageChangeTime || new Date().toISOString(),
      days_in_stage: daysInStage,
      activities_count: (d.activities_count as number) || 0,
      last_activity_date: d.last_activity_date || null,
      owner_name: ownerName,
      pipedrive_person_id: d.person_id && typeof d.person_id === "object"
        ? (d.person_id as Record<string, unknown>).value as number : null,
      pipedrive_org_id: d.org_id && typeof d.org_id === "object"
        ? (d.org_id as Record<string, unknown>).value as number : null,
      synced_at: new Date().toISOString(),
    }, { onConflict: "pipedrive_deal_id" });
    count++;
  }

  return res.json({ synced: count, message: `${count} 件の案件を同期しました` });
}

async function syncActivities(db: ReturnType<typeof getSupabaseAdmin>, res: VercelResponse) {
  const activities = await pdGetAll("/activities?type=call,meeting,email,task,deadline");
  let count = 0;

  for (const a of activities) {
    const actId = a.id as number;
    if (!actId) continue;

    // deal_id を検索
    let dealUuid: string | null = null;
    if (a.deal_id) {
      const { data: deal } = await db.from("deals").select("id").eq("pipedrive_deal_id", a.deal_id).maybeSingle();
      if (deal) dealUuid = deal.id;
    }

    await db.from("deal_activities").upsert({
      pipedrive_activity_id: actId,
      pipedrive_deal_id: (a.deal_id as number) || null,
      deal_id: dealUuid,
      type: (a.type as string) || "",
      subject: (a.subject as string) || "",
      note: (a.note as string) || "",
      done: !!(a.done as number),
      due_date: a.due_date || null,
      duration: (a.duration as number) || null,
      person_name: (a.person_name as string) || "",
      org_name: (a.org_name as string) || "",
      owner_name: (a.owner_name as string) || "",
    }, { onConflict: "pipedrive_activity_id" });
    count++;
  }

  return res.json({ synced: count, message: `${count} 件のアクティビティを同期しました` });
}

async function syncPersons(db: ReturnType<typeof getSupabaseAdmin>, res: VercelResponse) {
  const persons = await pdGetAll("/persons");
  let created = 0, updated = 0;

  for (const p of persons) {
    const personId = p.id as number;
    if (!personId) continue;

    const name = (p.name as string) || "";
    const email = Array.isArray(p.email) && p.email.length > 0
      ? (p.email[0] as Record<string, unknown>).value as string : null;
    const phone = Array.isArray(p.phone) && p.phone.length > 0
      ? (p.phone[0] as Record<string, unknown>).value as string : null;

    // 既存候補者を検索
    const { data: existing } = await db.from("candidates")
      .select("id").eq("pipedrive_person_id", personId).maybeSingle();

    if (existing) {
      await db.from("candidates").update({
        name, email, phone,
      }).eq("id", existing.id);
      updated++;
    } else {
      await db.from("candidates").insert({
        pipedrive_person_id: personId,
        name, email, phone,
        status: "new",
      });
      created++;
    }
  }

  return res.json({ created, updated, total: created + updated, message: `新規${created}件、更新${updated}件` });
}

/* ========== Query Functions ========== */

async function listDeals(db: ReturnType<typeof getSupabaseAdmin>, req: VercelRequest, res: VercelResponse) {
  const { status, stage_id, pipeline_id } = req.query;
  let query = db.from("deals").select("*").order("stage_order").order("updated_at", { ascending: false });

  if (status && typeof status === "string") query = query.eq("status", status);
  if (stage_id && typeof stage_id === "string") query = query.eq("stage_id", parseInt(stage_id));
  if (pipeline_id && typeof pipeline_id === "string") query = query.eq("pipeline_id", parseInt(pipeline_id));

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ deals: data || [], total: (data || []).length });
}

async function getDeal(db: ReturnType<typeof getSupabaseAdmin>, id: string, res: VercelResponse) {
  const { data: deal, error } = await db.from("deals").select("*").eq("id", id).single();
  if (error) return res.status(404).json({ error: "案件が見つかりません" });

  // 関連アクティビティ
  const { data: activities } = await db.from("deal_activities")
    .select("*").eq("deal_id", id).order("due_date", { ascending: false });

  // 関連議事録
  const { data: transcripts } = await db.from("meeting_transcripts")
    .select("id, title, summary, recorded_at").eq("deal_id", id).order("recorded_at", { ascending: false });

  return res.json({ deal, activities: activities || [], transcripts: transcripts || [] });
}

async function staleDeals(db: ReturnType<typeof getSupabaseAdmin>, req: VercelRequest, res: VercelResponse) {
  const days = parseInt((req.query.days as string) || "7");

  const { data, error } = await db.from("deals")
    .select("*")
    .eq("status", "open")
    .gt("days_in_stage", days)
    .order("days_in_stage", { ascending: false });

  if (error) return res.status(500).json({ error: error.message });

  return res.json({
    stale_deals: data || [],
    total: (data || []).length,
    threshold_days: days,
  });
}

async function pipelineStats(db: ReturnType<typeof getSupabaseAdmin>, res: VercelResponse) {
  const { data: deals } = await db.from("deals").select("*").eq("status", "open");

  if (!deals || deals.length === 0) {
    return res.json({ stages: [], total_value: 0, total_deals: 0 });
  }

  // ステージ別集計
  const stageMap = new Map<string, { name: string; order: number; count: number; value: number; avg_days: number; deals: unknown[] }>();

  for (const d of deals) {
    const key = String(d.stage_id);
    if (!stageMap.has(key)) {
      stageMap.set(key, {
        name: d.stage_name as string,
        order: d.stage_order as number,
        count: 0, value: 0, avg_days: 0, deals: [],
      });
    }
    const s = stageMap.get(key)!;
    s.count++;
    s.value += (d.value as number) || 0;
    s.avg_days += (d.days_in_stage as number) || 0;
    s.deals.push({ id: d.id, title: d.title, person_name: d.person_name, days_in_stage: d.days_in_stage, value: d.value });
  }

  const stages = [...stageMap.values()]
    .map((s) => ({ ...s, avg_days: Math.round(s.avg_days / s.count) }))
    .sort((a, b) => a.order - b.order);

  return res.json({
    stages,
    total_value: deals.reduce((sum, d) => sum + ((d.value as number) || 0), 0),
    total_deals: deals.length,
  });
}

/* ========== Gamification ========== */

interface ConsultantMetrics {
  name: string;
  xp: number;
  calls: number;
  meetings: number;
  emails: number;
  tasks: number;
  total_activities: number;
  deals_open: number;
  deals_won: number;
  deals_lost: number;
  total_value: number;
  won_value: number;
  avg_days_to_close: number;
  conversion_rate: number;
  activities_this_week: number;
  activities_last_week: number;
  streak_days: number;
}

const XP_TABLE = {
  call: 15,
  meeting: 30,
  email: 5,
  task: 10,
  deadline: 5,
  deal_created: 20,
  deal_won: 200,
  stage_advance: 25,
};

async function gamificationMetrics(
  db: ReturnType<typeof getSupabaseAdmin>,
  req: VercelRequest,
  res: VercelResponse,
) {
  const ownerFilter = req.query.owner as string | undefined;

  const { data: activities } = await db.from("deal_activities").select("*");
  const { data: deals } = await db.from("deals").select("*");

  if (!activities || !deals) {
    return res.json({ consultants: [], generated_at: new Date().toISOString() });
  }

  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay());
  weekStart.setHours(0, 0, 0, 0);
  const lastWeekStart = new Date(weekStart);
  lastWeekStart.setDate(lastWeekStart.getDate() - 7);

  const consultantMap = new Map<string, ConsultantMetrics>();

  const getOrCreate = (name: string): ConsultantMetrics => {
    if (!name) name = "不明";
    if (!consultantMap.has(name)) {
      consultantMap.set(name, {
        name, xp: 0, calls: 0, meetings: 0, emails: 0, tasks: 0,
        total_activities: 0, deals_open: 0, deals_won: 0, deals_lost: 0,
        total_value: 0, won_value: 0, avg_days_to_close: 0,
        conversion_rate: 0, activities_this_week: 0, activities_last_week: 0,
        streak_days: 0,
      });
    }
    return consultantMap.get(name)!;
  };

  for (const a of activities) {
    const c = getOrCreate(a.owner_name);
    c.total_activities++;
    const type = a.type as string;
    if (type === "call") { c.calls++; c.xp += XP_TABLE.call; }
    else if (type === "meeting") { c.meetings++; c.xp += XP_TABLE.meeting; }
    else if (type === "email") { c.emails++; c.xp += XP_TABLE.email; }
    else if (type === "task") { c.tasks++; c.xp += XP_TABLE.task; }
    else { c.xp += XP_TABLE.deadline; }

    if (a.due_date) {
      const d = new Date(a.due_date);
      if (d >= weekStart) c.activities_this_week++;
      else if (d >= lastWeekStart && d < weekStart) c.activities_last_week++;
    }
  }

  const closedDeals: Record<string, number[]> = {};

  for (const d of deals) {
    const c = getOrCreate(d.owner_name);
    c.total_value += (d.value as number) || 0;
    if (d.status === "open") {
      c.deals_open++;
      c.xp += XP_TABLE.deal_created;
    } else if (d.status === "won") {
      c.deals_won++;
      c.won_value += (d.value as number) || 0;
      c.xp += XP_TABLE.deal_won;
      if (d.won_time && d.created_at) {
        const days = Math.floor(
          (new Date(d.won_time as string).getTime() - new Date(d.created_at as string).getTime()) / 86400000,
        );
        if (!closedDeals[c.name]) closedDeals[c.name] = [];
        closedDeals[c.name].push(days);
      }
    } else if (d.status === "lost") {
      c.deals_lost++;
    }
  }

  for (const [name, days] of Object.entries(closedDeals)) {
    const c = consultantMap.get(name);
    if (c && days.length > 0) {
      c.avg_days_to_close = Math.round(days.reduce((a, b) => a + b, 0) / days.length);
    }
  }

  for (const c of consultantMap.values()) {
    const total = c.deals_won + c.deals_lost;
    c.conversion_rate = total > 0 ? Math.round((c.deals_won / total) * 100) : 0;
  }

  // Activity streak: count consecutive days with activity (from today backward)
  for (const c of consultantMap.values()) {
    const ownerActivities = activities
      .filter((a) => a.owner_name === c.name && a.due_date)
      .map((a) => a.due_date as string)
      .sort()
      .reverse();

    const seen = new Set(ownerActivities.map((d) => d.slice(0, 10)));
    let streak = 0;
    const check = new Date();
    for (let i = 0; i < 365; i++) {
      const dateStr = check.toISOString().slice(0, 10);
      if (seen.has(dateStr)) {
        streak++;
        check.setDate(check.getDate() - 1);
      } else {
        break;
      }
    }
    c.streak_days = streak;
  }

  let result = [...consultantMap.values()].sort((a, b) => b.xp - a.xp);
  if (ownerFilter) {
    result = result.filter((c) => c.name === ownerFilter);
  }

  // Top performer for comparison
  const topPerformer = [...consultantMap.values()].sort((a, b) => b.xp - a.xp)[0] || null;

  return res.json({
    consultants: result,
    top_performer: topPerformer,
    team_avg: {
      activities_per_week: result.length > 0
        ? Math.round(result.reduce((s, c) => s + c.activities_this_week, 0) / result.length)
        : 0,
      conversion_rate: result.length > 0
        ? Math.round(result.reduce((s, c) => s + c.conversion_rate, 0) / result.length)
        : 0,
      avg_deals_won: result.length > 0
        ? Math.round(result.reduce((s, c) => s + c.deals_won, 0) / result.length)
        : 0,
    },
    generated_at: new Date().toISOString(),
  });
}

async function generateCoaching(
  db: ReturnType<typeof getSupabaseAdmin>,
  req: VercelRequest,
  res: VercelResponse,
) {
  const { consultant_name } = req.body || {};
  if (!consultant_name) return res.status(400).json({ error: "consultant_name required" });

  const { data: activities } = await db.from("deal_activities")
    .select("*").eq("owner_name", consultant_name).order("due_date", { ascending: false }).limit(50);
  const { data: deals } = await db.from("deals")
    .select("*").eq("owner_name", consultant_name);
  const { data: allDeals } = await db.from("deals").select("owner_name, status, value, won_time, activities_count");
  const { data: allActivities } = await db.from("deal_activities").select("owner_name, type");

  // Build team benchmark
  const teamStats: Record<string, { won: number; total: number; activities: number }> = {};
  for (const d of allDeals || []) {
    const n = d.owner_name as string;
    if (!teamStats[n]) teamStats[n] = { won: 0, total: 0, activities: 0 };
    teamStats[n].total++;
    if (d.status === "won") teamStats[n].won++;
  }
  for (const a of allActivities || []) {
    const n = a.owner_name as string;
    if (teamStats[n]) teamStats[n].activities++;
  }

  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) {
    return res.json({
      coaching: "OpenAI API キーが設定されていません。環境変数 OPENAI_API_KEY を設定してください。",
      metrics_summary: { activities: activities?.length || 0, deals: deals?.length || 0 },
    });
  }

  const myStats = teamStats[consultant_name] || { won: 0, total: 0, activities: 0 };
  const topName = Object.entries(teamStats).sort((a, b) => b[1].won - a[1].won)[0];

  const prompt = `あなたは建築技術者専門の人材紹介会社のセールスコーチです。
以下のデータに基づき、コンサルタント「${consultant_name}」への具体的なフィードバックを日本語で3つ提供してください。

## ${consultant_name}のデータ:
- 総活動数: ${myStats.activities}件（電話/面談/メール/タスク）
- Deal数: ${myStats.total}件（成約: ${myStats.won}件）
- 成約率: ${myStats.total > 0 ? Math.round((myStats.won / myStats.total) * 100) : 0}%
- 最近の活動: ${(activities || []).slice(0, 10).map((a) => `${a.type}:${a.subject}`).join(", ")}

## チームトップ（${topName ? topName[0] : "N/A"}）:
- 活動数: ${topName ? topName[1].activities : 0}件
- 成約: ${topName ? topName[1].won : 0}件
- 成約率: ${topName ? (topName[1].total > 0 ? Math.round((topName[1].won / topName[1].total) * 100) : 0) : 0}%

## 回答フォーマット:
各フィードバックは以下の形式で:
1. **[強み/改善点のタイトル]**: 具体的なアドバイス（数字に基づく）

トーンは応援する先輩コーチのように。建築技術者の転職市場の文脈を踏まえて。`;

  const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${openaiKey}` },
    body: JSON.stringify({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 800,
    }),
  });

  const openaiData = await openaiRes.json();
  const coaching = openaiData.choices?.[0]?.message?.content || "フィードバックを生成できませんでした。";

  return res.json({
    coaching,
    metrics_summary: {
      activities: myStats.activities,
      deals: myStats.total,
      won: myStats.won,
      conversion_rate: myStats.total > 0 ? Math.round((myStats.won / myStats.total) * 100) : 0,
      top_performer: topName ? topName[0] : null,
    },
  });
}
