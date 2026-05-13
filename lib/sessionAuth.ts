// Session-based auth: validate a signed-in user against an email allow-list.
//
// Used by middleware (page routes) and apiGuard (API routes). Together with
// CRON_SECRET-based machine auth, every protected handler has exactly one
// of: (a) a valid user session with allow-listed email, or (b) a valid
// Bearer secret. Neither = 401.
//
// The pure helpers (`isEmailAllowed`, `teamAuthEnabled`) are dependency-free
// so they can be unit-tested without bringing in `next/headers`. The
// session resolver dynamically imports `./supabaseServer` only when needed.

export interface SessionUser {
  id: string;
  email: string;
}

function parseAllowList(raw: string | undefined): Set<string> {
  if (!raw) return new Set();
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isEmailAllowed(email: string | null | undefined): boolean {
  if (!email) return false;
  const allow = parseAllowList(process.env.ALLOWED_EMAILS);
  if (allow.size === 0) {
    // Explicit fail-closed: refuse to run team auth without an allow list.
    return false;
  }
  return allow.has(email.toLowerCase());
}

export function authConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

export function teamAuthEnabled(): boolean {
  return authConfigured() && Boolean(process.env.ALLOWED_EMAILS);
}

// Returns the current authenticated + allow-listed user, or null.
// Never throws — callers decide what to do with `null`.
export async function getSessionUser(): Promise<SessionUser | null> {
  if (!authConfigured()) return null;
  try {
    const { createSupabaseServer } = await import("./supabaseServer.ts");
    const supa = await createSupabaseServer();
    const { data } = await supa.auth.getUser();
    const u = data.user;
    if (!u || !u.email) return null;
    if (!isEmailAllowed(u.email)) return null;
    return { id: u.id, email: u.email };
  } catch {
    return null;
  }
}
