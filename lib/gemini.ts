// Gemini 2.5 Flash Lite client (REST). No SDK.
// Returns raw text; JSON variants attempt to extract a fenced or first {...}/[...] block.

const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";

export const geminiConfigured = Boolean(process.env.GEMINI_API_KEY);

export async function geminiText(prompt: string, opts: { temperature?: number } = {}): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY not set");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`;
  const body = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: opts.temperature ?? 0.2,
      responseMimeType: "text/plain",
    },
  };
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`gemini: ${res.status} ${await res.text()}`);
  const j = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  return j.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") ?? "";
}

function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();
  const firstBrace = text.indexOf("{");
  const firstBracket = text.indexOf("[");
  let start = -1;
  if (firstBrace === -1) start = firstBracket;
  else if (firstBracket === -1) start = firstBrace;
  else start = Math.min(firstBrace, firstBracket);
  if (start < 0) return text;
  // Find matching last brace/bracket of same kind.
  const open = text[start];
  const close = open === "{" ? "}" : "]";
  const end = text.lastIndexOf(close);
  if (end > start) return text.slice(start, end + 1);
  return text.slice(start);
}

export async function geminiJSON<T = unknown>(prompt: string, opts: { temperature?: number } = {}): Promise<T> {
  const raw = await geminiText(
    prompt + "\n\n出力は厳密な JSON のみ。説明文や ```json フェンスは不要。",
    opts
  );
  const cleaned = extractJson(raw);
  try {
    return JSON.parse(cleaned) as T;
  } catch (e) {
    throw new Error(`gemini JSON parse failed: ${(e as Error).message}\nraw: ${raw.slice(0, 500)}`);
  }
}
