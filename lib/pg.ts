// PostgREST filter helpers. PostgREST parses filter values from the URL
// query string and forwards them to PostgreSQL as bind parameters, so SQLi
// proper is not the risk. The real risks are:
//
//   1. Unsanitized values containing `,`, `(`, `)`, `.` etc. confusing the
//      PostgREST parser (e.g. `id=in.(...)` smuggling extra filters).
//   2. Values containing URL-reserved chars (`#`, `&`, `%`) that change the
//      meaning of the request when concatenated naively.
//   3. Type confusion — passing a non-UUID where a UUID is expected can
//      surface raw Postgres errors with column names.
//
// Use these helpers everywhere instead of template-string interpolation.

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

export function assertUuid(v: unknown, label = "id"): string {
  if (!isUuid(v)) throw new Error(`invalid ${label}`);
  return v;
}

// PostgREST treats `,` and parens as significant inside list filters and
// inside `like.` patterns. Encode aggressively.
function pgEncodeValue(v: string | number | boolean): string {
  return encodeURIComponent(String(v));
}

// `column=eq.<value>`
export function pgEq(column: string, value: string | number | boolean): string {
  return `${column}=eq.${pgEncodeValue(value)}`;
}

// `column=in.(a,b,c)` — values must be already-validated atoms.
export function pgInUuids(column: string, ids: string[]): string {
  for (const id of ids) assertUuid(id, column);
  return `${column}=in.(${ids.join(",")})`;
}

// `column=is.null` / `column=not.is.null`
export function pgIsNull(column: string, negate = false): string {
  return negate ? `${column}=not.is.null` : `${column}=is.null`;
}

// Bounded positive int, fall back to default. Useful for `?limit=` etc.
export function clampInt(raw: string | null | undefined, def: number, max: number, min = 1): number {
  if (raw == null || raw === "") return def;
  const n = Number(raw);
  if (!Number.isFinite(n)) return def;
  return Math.max(min, Math.min(max, Math.floor(n)));
}
