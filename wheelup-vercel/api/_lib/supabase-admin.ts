/**
 * Supabase サーバークライアント（Vercel Serverless 用）
 * service_role_key を使用し RLS をバイパスする
 */
import { createClient } from "@supabase/supabase-js";

export function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      `Supabase環境変数が未設定です。SUPABASE_URL=${url ? "✓" : "✗"}, SUPABASE_SERVICE_ROLE_KEY=${key ? "✓" : "✗"}`
    );
  }
  return createClient(url, key);
}
