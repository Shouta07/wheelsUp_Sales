/**
 * Minimal Gemini REST client for the RA prospecting subsystem.
 * JSON-mode only — every caller wants structured output.
 *
 * 設計方針: 429/503 でもリトライしない (fail-fast)。
 * 理由は Vercel 関数の 60s タイムアウト枠の中で 10秒級の retry を入れると
 * 関数全体がタイムアウトしてしまう (FUNCTION_INVOCATION_TIMEOUT)。
 * 上位層は per-item try/catch で「次の会社へ進む」処理にしているので、
 * 個別エラーは握り潰して問題ない。
 *
 * Rate limit に当たり始めたら、ユーザーは 1 分後に再実行すれば良い。
 */

const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";
const KEY = process.env.GEMINI_API_KEY;

export const hasGemini = Boolean(KEY);
export const geminiModel = MODEL;

export async function generateJson<T>(
  prompt: string,
  opts: { temperature?: number } = {},
): Promise<T> {
  if (!KEY) throw new Error("GEMINI_API_KEY not configured");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${KEY}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: opts.temperature ?? 0.2,
        responseMimeType: "application/json",
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    // 429 / 503 は短く分かりやすいメッセージで返す (詳細は flatten すると長すぎる)
    if (res.status === 429) {
      throw new Error(`gemini 429 rate-limited (free tier 10 RPM): ${errText.slice(0, 200)}`);
    }
    throw new Error(`gemini ${res.status}: ${errText.slice(0, 300)}`);
  }

  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const raw = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  const cleaned = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/g, "").trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch (err) {
    throw new Error(`gemini: failed to parse JSON: ${(err as Error).message}\n--- raw ---\n${raw}`);
  }
}
