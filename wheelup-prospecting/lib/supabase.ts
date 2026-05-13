// Thin Supabase REST helper — no SDK.
// Returns null-ish behaviour when env is missing so the app falls back to mock mode.

const URL_ = process.env.SUPABASE_URL?.replace(/\/$/, "");
const KEY_ = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const isLive = Boolean(URL_ && KEY_);

type Method = "GET" | "POST" | "PATCH" | "DELETE";

type Options = {
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  prefer?: string;
  signal?: AbortSignal;
};

function buildUrl(path: string, query?: Options["query"]) {
  const u = new URL(`${URL_}/rest/v1/${path.replace(/^\//, "")}`);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined) continue;
      u.searchParams.set(k, String(v));
    }
  }
  return u.toString();
}

async function request<T>(method: Method, path: string, opts: Options = {}): Promise<T> {
  if (!isLive) throw new Error("supabase: SUPABASE_URL/SERVICE_ROLE_KEY not configured");
  const res = await fetch(buildUrl(path, opts.query), {
    method,
    headers: {
      apikey: KEY_!,
      Authorization: `Bearer ${KEY_!}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(opts.prefer ? { Prefer: opts.prefer } : {}),
    },
    body: opts.body == null ? undefined : JSON.stringify(opts.body),
    signal: opts.signal,
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`supabase ${method} ${path} → ${res.status}: ${text}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const sb = {
  select<T>(table: string, query?: Options["query"]) {
    return request<T[]>("GET", table, { query });
  },
  selectOne<T>(table: string, query?: Options["query"]) {
    return request<T[]>("GET", table, { query }).then((r) => r[0] ?? null);
  },
  insert<T>(table: string, rows: unknown, { onConflict, returning = "representation" }: { onConflict?: string; returning?: "representation" | "minimal" } = {}) {
    const prefer = `return=${returning}${onConflict ? ",resolution=merge-duplicates" : ""}`;
    return request<T[]>("POST", table, {
      body: Array.isArray(rows) ? rows : [rows],
      prefer,
      query: onConflict ? { on_conflict: onConflict } : undefined,
    });
  },
  update<T>(table: string, body: unknown, query: Options["query"]) {
    return request<T[]>("PATCH", table, { body, query, prefer: "return=representation" });
  },
};
