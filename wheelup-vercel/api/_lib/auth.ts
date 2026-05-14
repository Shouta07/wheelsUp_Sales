// API authentication for the wheelup-vercel meetings/* surface.
//
// Two acceptance paths:
//   1. Authorization: Bearer <Supabase JWT>  — issued by Supabase Auth to a
//      signed-in user. Verified by calling supabase.auth.getUser(jwt). The
//      email must be in ALLOWED_EMAILS.
//   2. Authorization: Bearer <CRON_SECRET>   — machine callers (Vercel Cron,
//      curl scripts). Verified by timing-safe equality.

import { timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import type { VercelRequest } from "@vercel/node";

const FORBIDDEN_DEFAULTS = new Set(["", "change-me", "changeme", "secret", "password"]);
const MIN_SECRET_LENGTH = 24;

export interface SessionUser {
  id: string;
  email: string;
}

export interface AuthOk {
  ok: true;
  via: "session" | "bearer";
  user: SessionUser | null;
}
export interface AuthFail {
  ok: false;
  status: 401 | 500;
  reason: string;
}
export type AuthResult = AuthOk | AuthFail;

function safeEqualString(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) {
    timingSafeEqual(ab, Buffer.alloc(ab.length, 0));
    return false;
  }
  return timingSafeEqual(ab, bb);
}

function parseAllowList(): Set<string> {
  const raw = process.env.ALLOWED_EMAILS || "";
  return new Set(raw.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean));
}

export function isEmailAllowed(email: string | null | undefined): boolean {
  if (!email) return false;
  const allow = parseAllowList();
  if (allow.size === 0) return false;
  return allow.has(email.toLowerCase());
}

function configuredCronSecret(): { ok: true; secret: string } | { ok: false; reason: string } {
  const raw = process.env.CRON_SECRET;
  if (!raw) return { ok: false, reason: "CRON_SECRET not set" };
  if (FORBIDDEN_DEFAULTS.has(raw)) return { ok: false, reason: "CRON_SECRET uses forbidden default" };
  if (raw.length < MIN_SECRET_LENGTH) return { ok: false, reason: `CRON_SECRET too short (<${MIN_SECRET_LENGTH})` };
  return { ok: true, secret: raw };
}

function extractToken(req: VercelRequest): string | null {
  const auth = req.headers.authorization || req.headers.Authorization;
  if (typeof auth === "string") {
    const m = /^Bearer\s+(.+)$/i.exec(auth.trim());
    if (m) return m[1] ?? null;
  }
  // Legacy fallback only — discouraged.
  const q = req.query.secret;
  if (typeof q === "string" && q.length > 0) return q;
  return null;
}

// JWTs are roughly 100-2000 chars and contain two dots; CRON_SECRET is short
// random text without dots. We use this cheap heuristic to decide whether to
// call supabase.auth.getUser() (which costs a round-trip) versus a local
// timing-safe compare.
function looksLikeJwt(token: string): boolean {
  return token.length > 60 && token.split(".").length === 3;
}

async function verifyJwt(token: string): Promise<SessionUser | null> {
  const url = process.env.SUPABASE_URL;
  // VITE_SUPABASE_ANON_KEY is exposed to Vercel functions too — prefer the
  // explicit non-public name when set.
  const key = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  try {
    const client = createClient(url, key, { auth: { persistSession: false } });
    const { data, error } = await client.auth.getUser(token);
    if (error || !data.user || !data.user.email) return null;
    return { id: data.user.id, email: data.user.email };
  } catch {
    return null;
  }
}

// 3 deployment modes:
//   team  — Supabase JWT (browser) OR Bearer CRON_SECRET (machine). Default.
//   open  — no authentication. Identity comes from the X-User-Name header
//           (set by the browser from the name-picker). Audit only; trust
//           the URL secrecy + Vercel deploy URL as the perimeter.
//   mock  — auth not yet configured. Used for local dev/CI.
export type AuthMode = "team" | "open" | "mock";

export function authMode(): AuthMode {
  const m = (process.env.AUTH_MODE || "").toLowerCase();
  if (m === "open") return "open";
  if (m === "mock") return "mock";
  return "team";
}

const NAME_RE = /^[\p{L}\p{N}_\-. ]{1,60}$/u;
function pickedName(req: VercelRequest): string | null {
  const raw = req.headers["x-user-name"];
  const h = typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : null;
  if (h && NAME_RE.test(h.trim())) return h.trim();
  const body = (req.body || {}) as Record<string, unknown>;
  const b = body.consultant_name;
  if (typeof b === "string" && NAME_RE.test(b.trim())) return b.trim();
  return null;
}

export async function checkAuth(req: VercelRequest): Promise<AuthResult> {
  const mode = authMode();

  if (mode === "mock") {
    return { ok: true, via: "bearer", user: null };
  }

  if (mode === "open") {
    // No authentication. Identity is whatever name the browser claims via
    // X-User-Name (or consultant_name in the body). Used for tiny internal
    // teams behind a private Vercel URL.
    const name = pickedName(req);
    return {
      ok: true,
      via: "session",
      user: name ? { id: `open:${name}`, email: name } : null,
    };
  }

  // team mode — full Supabase JWT + Bearer fallback.
  const cron = configuredCronSecret();
  if (!cron.ok) return { ok: false, status: 500, reason: cron.reason };

  const token = extractToken(req);
  if (!token) return { ok: false, status: 401, reason: "missing_credentials" };

  if (looksLikeJwt(token)) {
    const user = await verifyJwt(token);
    if (!user) return { ok: false, status: 401, reason: "invalid_jwt" };
    if (!isEmailAllowed(user.email)) return { ok: false, status: 401, reason: "email_not_allowed" };
    return { ok: true, via: "session", user };
  }

  if (safeEqualString(token, cron.secret)) {
    return { ok: true, via: "bearer", user: null };
  }
  return { ok: false, status: 401, reason: "invalid_bearer" };
}
