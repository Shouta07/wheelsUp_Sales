// Minimal Gemini REST client — JSON-mode generation only.

const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";
const KEY = process.env.GEMINI_API_KEY;

export const hasGemini = Boolean(KEY);

type Part = { text: string };
type Content = { role: "user" | "model"; parts: Part[] };

async function callRaw(contents: Content[], opts: { json?: boolean; temperature?: number } = {}): Promise<string> {
  if (!KEY) throw new Error("gemini: GEMINI_API_KEY not configured");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${KEY}`;
  const body = {
    contents,
    generationConfig: {
      temperature: opts.temperature ?? 0.2,
      ...(opts.json ? { responseMimeType: "application/json" } : {}),
    },
  };
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`gemini ${res.status}: ${await res.text().catch(() => "")}`);
  }
  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  return data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
}

export async function generateJson<T>(prompt: string, opts: { temperature?: number } = {}): Promise<T> {
  const raw = await callRaw([{ role: "user", parts: [{ text: prompt }] }], { json: true, temperature: opts.temperature });
  // Strip the occasional ```json fence.
  const cleaned = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/g, "").trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch (err) {
    throw new Error(`gemini: failed to parse JSON: ${(err as Error).message}\n--- raw ---\n${raw}`);
  }
}

export const geminiModel = MODEL;
