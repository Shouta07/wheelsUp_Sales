/**
 * Supabase サーバークライアント（Vercel Serverless 用）
 * service_role_key を使用し RLS をバイパスする
 */
import { createClient } from "@supabase/supabase-js";

function fixUrl(raw: string): string {
  let u = raw.trim().replace(/^["']+|["']+$/g, "");
  if (!u.startsWith("http")) u = `https://${u}`;
  return u.replace(/\/+$/, "");
}

export function getSupabaseAdmin() {
  const rawUrl = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!rawUrl || !key) {
    throw new Error(
      `Supabase環境変数が未設定です。SUPABASE_URL=${rawUrl ? "✓" : "✗"}, SUPABASE_SERVICE_ROLE_KEY=${key ? "✓" : "✗"}`
    );
  }
  return createClient(fixUrl(rawUrl), key.trim());
}
