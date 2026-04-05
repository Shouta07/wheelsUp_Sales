import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getSupabaseAdmin } from "../../_lib/supabase-admin.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const db = getSupabaseAdmin();
  const userName = req.query.userName as string;

  const { data } = await db
    .from("learning_progress")
    .select("*")
    .eq("user_name", userName)
    .order("studied_at", { ascending: false });

  const entries = data || [];
  return res.json({
    user_name: userName,
    total_studied: entries.length,
    completed: entries.filter((e: Record<string, unknown>) => e.completed).length,
    entries,
  });
}
