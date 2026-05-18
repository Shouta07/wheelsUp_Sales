/**
 * Minimal Gemini REST client for the RA prospecting subsystem.
 * JSON-mode only — every caller wants structured output.
 *
 * 429 (RESOURCE_EXHAUSTED) を踏んだら、API のメッセージに含まれる
 * "Please retry in Xs" の指示に従ってリトライする。最大 3 回 (= 約 30s)。
 * 並列度を上げすぎても飲み込めるので、上位層は気にせず投げて良い。
 */

const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";
const KEY = process.env.GEMINI_API_KEY;

export const hasGemini = Boolean(KEY);
export const geminiModel = MODEL;

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

/** Parse "Please retry in 9.38s" → 9380 ms.  Returns null if not found. */
function parseRetryAfter(text: string): number | null {
  const m = text.match(/retry in ([\d.]+)\s*s/i);
  if (!m) return null;
  const sec = Number(m[1]);
  return Number.isFinite(sec) ? Math.ceil(sec * 1000) : null;
}

export async function generateJson<T>(
  prompt: string,
  opts: { temperature?: number; maxRetries?: number } = {},
): Promise<T> {
  if (!KEY) throw new Error("GEMINI_API_KEY not configured");
  const maxRetries = opts.maxRetries ?? 3;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${KEY}`;

  let lastErrorText = "";
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
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

    if (res.ok) {
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

    lastErrorText = await res.text().catch(() => "");

    // 429: rate-limited. Honour the retry-after hint, then retry.
    // 503 (Service Unavailable) も短時間で復帰することが多いので軽くリトライ。
    if ((res.status === 429 || res.status === 503) && attempt < maxRetries) {
      const hint = parseRetryAfter(lastErrorText);
      // ヒント無しなら指数バックオフ: 2s, 4s, 8s ...
      const waitMs = hint ?? Math.min(2000 * Math.pow(2, attempt), 16000);
      await sleep(waitMs + 200); // 安全マージン 200ms
      continue;
    }

    throw new Error(`gemini ${res.status}: ${lastErrorText.slice(0, 500)}`);
  }
  throw new Error(`gemini: exhausted ${maxRetries} retries. last: ${lastErrorText.slice(0, 300)}`);
}
