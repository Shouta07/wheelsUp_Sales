/**
 * Minimal Gemini REST client for the RA prospecting subsystem.
 * JSON-mode only — every caller wants structured output.
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
  if (!res.ok) throw new Error(`gemini ${res.status}: ${await res.text().catch(() => "")}`);
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
