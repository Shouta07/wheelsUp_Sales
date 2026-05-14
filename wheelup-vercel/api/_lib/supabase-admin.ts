/**
 * Supabase サーバークライアント（Vercel Serverless 用）
 * service_role_key を使用し RLS をバイパスする
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export function normalizeSupabaseUrl(raw: string | undefined | null): string {
  if (!raw) return "";
  let u = raw.trim().replace(/^["']+|["']+$/g, "");
  if (!u) return "";
  if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
  return u.replace(/\/+$/, "");
}

export function getSupabaseEnv(): { url: string; key: string } {
  const url = normalizeSupabaseUrl(process.env.SUPABASE_URL);
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  if (!url || !key) {
    throw new Error(
      `Supabase環境変数が未設定です。SUPABASE_URL=${url ? "✓" : "✗"}, SUPABASE_SERVICE_ROLE_KEY=${key ? "✓" : "✗"}`,
    );
  }
  return { url, key };
}

let cached: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (cached) return cached;
  const { url, key } = getSupabaseEnv();
  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
