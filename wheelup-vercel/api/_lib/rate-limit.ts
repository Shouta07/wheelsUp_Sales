// シンプルな in-memory レート制限。Vercel Functions は cold start でリセットされるが、
// 同一インスタンス内 (= 1 ユーザーの連打) を防ぐには十分。
// 永続的な制限は Gemini 側の 429 が最終防衛線になる。

interface Bucket {
  count: number;
  windowStart: number;
}

const buckets = new Map<string, Bucket>();
const WINDOW_MS = 60 * 1000; // 1 分窓
const MAX_PER_WINDOW = 6; // ユーザー 1 人あたり 1 分 6 リクエスト (15 RPM Gemini 制限に対する安全マージン)

export function checkRateLimit(key: string): { ok: boolean; retryAfterSec?: number } {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || now - b.windowStart > WINDOW_MS) {
    buckets.set(key, { count: 1, windowStart: now });
    return { ok: true };
  }
  if (b.count >= MAX_PER_WINDOW) {
    const retryAfter = Math.ceil((b.windowStart + WINDOW_MS - now) / 1000);
    return { ok: false, retryAfterSec: retryAfter };
  }
  b.count++;
  return { ok: true };
}

// 古いバケツの掃除 (メモリ肥大化防止)
export function cleanupRateLimits() {
  const now = Date.now();
  for (const [key, b] of buckets.entries()) {
    if (now - b.windowStart > WINDOW_MS * 2) buckets.delete(key);
  }
}
