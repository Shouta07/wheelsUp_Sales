import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getSupabaseAdmin } from "../_lib/supabase-admin.js";

const PIPEDRIVE_BASE = "https://api.pipedrive.com/v1";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const apiToken = process.env.PIPEDRIVE_API_TOKEN;
  if (!apiToken) return res.status(500).json({ error: "PIPEDRIVE_API_TOKEN not set" });

  const db = getSupabaseAdmin();

  // Pipedrive から全 Organization を取得（ページネーション対応）
  const orgs: Array<Record<string, unknown>> = [];
  let start = 0;
  const limit = 100;

  while (true) {
    const url = `${PIPEDRIVE_BASE}/organizations?api_token=${apiToken}&start=${start}&limit=${limit}`;
    const resp = await fetch(url);
    const json = await resp.json();
    const items = json.data || [];
    orgs.push(...items);

    const more = json.additional_data?.pagination?.more_items_in_collection;
    if (!more) break;
    start = json.additional_data.pagination.next_start || start + limit;
  }

  // Upsert
  let count = 0;
  for (const org of orgs) {
    const orgId = org.id as number;
    if (!orgId) continue;

    await db.from("companies").upsert(
      {
        pipedrive_org_id: orgId,
        name: (org.name as string) || "",
        address: (org.address as string) || "",
        people_count: (org.people_count as number) || 0,
        open_deals_count: (org.open_deals_count as number) || 0,
        won_deals_count: (org.won_deals_count as number) || 0,
        synced_at: new Date().toISOString(),
      },
      { onConflict: "pipedrive_org_id" },
    );
    count++;
  }

  return res.json({ synced: count, message: `${count} 件の企業を同期しました` });
}
