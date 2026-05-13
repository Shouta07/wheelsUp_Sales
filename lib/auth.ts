// API authentication.
//
// All /api/* endpoints share a single secret. Cron callers pass it via
// `Authorization: Bearer <secret>` (preferred). Manual / Vercel Cron callers
// may also pass `?secret=` for compatibility, but this is logged as a warning
// because URLs can leak to access logs / browser history.

import { timingSafeEqual } from "node:crypto";

const FORBIDDEN_DEFAULTS = new Set(["", "change-me", "changeme", "secret", "password"]);
const MIN_SECRET_LENGTH = 24;

export interface AuthFailure {
  response: Response;
  reason: string;
}

function safeEqualString(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) {
    // Still compare against a fixed-size buffer to keep timing flat.
    const filler = Buffer.alloc(ab.length, 0);
    timingSafeEqual(ab, filler);
    return false;
  }
  return timingSafeEqual(ab, bb);
}

function getConfiguredSecret(): { ok: true; secret: string } | { ok: false; reason: string } {
  const raw = process.env.CRON_SECRET;
  if (!raw) return { ok: false, reason: "CRON_SECRET not set" };
  if (FORBIDDEN_DEFAULTS.has(raw)) return { ok: false, reason: "CRON_SECRET is using a forbidden default" };
  if (raw.length < MIN_SECRET_LENGTH) {
    return { ok: false, reason: `CRON_SECRET too short (min ${MIN_SECRET_LENGTH} chars)` };
  }
  return { ok: true, secret: raw };
}

function extractPresentedSecret(req: Request): { value: string | null; viaQuery: boolean } {
  const auth = req.headers.get("authorization");
  if (auth) {
    const m = /^Bearer\s+(.+)$/i.exec(auth.trim());
    if (m) return { value: m[1], viaQuery: false };
  }
  const url = new URL(req.url);
  const q = url.searchParams.get("secret");
  if (q) return { value: q, viaQuery: true };
  return { value: null, viaQuery: false };
}

export function checkAuth(req: Request): AuthFailure | null {
  const cfg = getConfiguredSecret();
  if (!cfg.ok) {
    return {
      response: Response.json({ error: "server_misconfigured" }, { status: 500 }),
      reason: cfg.reason,
    };
  }
  const presented = extractPresentedSecret(req);
  if (!presented.value || !safeEqualString(presented.value, cfg.secret)) {
    return {
      response: Response.json({ error: "unauthorized" }, { status: 401 }),
      reason: "bad or missing secret",
    };
  }
  return null;
}

// Back-compat wrapper for the old call sites.
export function requireSecret(req: Request): Response | null {
  return checkAuth(req)?.response ?? null;
}
