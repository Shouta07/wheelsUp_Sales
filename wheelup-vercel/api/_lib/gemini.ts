// Gemini wrapper with one retry on transient failures (5xx, 429).
// Returns text or throws GeminiError with a stable shape.

export class GeminiError extends Error {
  status: number;
  retryable: boolean;
  constructor(message: string, status: number, retryable: boolean) {
    super(message);
    this.status = status;
    this.retryable = retryable;
  }
}

interface CallOptions {
  model?: string;
  temperature?: number;
  maxOutputTokens?: number;
  // Inline binary attachments (e.g. audio for transcription).
  inlineData?: { mime_type: string; data: string }[];
  text: string;
}

export async function geminiText(opts: CallOptions): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new GeminiError("GEMINI_API_KEY not set", 500, false);

  const model = opts.model || process.env.GEMINI_MODEL || "gemini-2.0-flash";
  const parts: Record<string, unknown>[] = [];
  if (opts.inlineData) {
    for (const a of opts.inlineData) parts.push({ inline_data: a });
  }
  parts.push({ text: opts.text });

  const body = {
    contents: [{ parts }],
    generationConfig: {
      temperature: opts.temperature ?? 0.2,
      maxOutputTokens: opts.maxOutputTokens ?? 4096,
    },
  };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  let lastErr: GeminiError | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch (e) {
      lastErr = new GeminiError(`fetch_failed: ${(e as Error).message}`, 502, true);
      continue;
    }
    if (res.ok) {
      const j = (await res.json().catch(() => null)) as
        | { candidates?: { content?: { parts?: { text?: string }[] } }[] }
        | null;
      const text = j?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") ?? "";
      return text;
    }
    const status = res.status;
    const retryable = status === 429 || status >= 500;
    lastErr = new GeminiError(`gemini_status_${status}`, status, retryable);
    if (!retryable) break;
    // Small backoff before retry.
    await new Promise((r) => setTimeout(r, 600));
  }
  throw lastErr ?? new GeminiError("gemini_unknown", 500, false);
}
