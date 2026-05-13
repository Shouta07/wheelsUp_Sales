// Per-route guard: auth (session OR Bearer) + rate limit + structured logging.
//
// Acceptance order:
//   1. Supabase session cookie + email in ALLOWED_EMAILS  (browser-driven)
//   2. Authorization: Bearer <CRON_SECRET>                (machine / cron)
//   3. ?secret=<CRON_SECRET>                              (legacy, logged)
//
// Either authenticated path is acceptable. If neither matches → 401.

import { checkAuth } from "./auth";
import { getSessionUser, type SessionUser } from "./sessionAuth";
import { clientIp, rateLimit, type RateLimitOptions } from "./ratelimit";
import { log, newRequestId } from "./logger";

export interface GuardOk {
  deny: null;
  requestId: string;
  user: SessionUser | null;   // null when authed via Bearer (machine)
}

export interface GuardDeny {
  deny: Response;
  requestId: string;
  user: null;
}

export type GuardResult = GuardOk | GuardDeny;

export interface GuardOptions {
  route: string;
  limit: RateLimitOptions;
}

export async function guardRequest(req: Request, opts: GuardOptions): Promise<GuardResult> {
  const requestId = newRequestId();

  // 1. Try session first.
  const sessionUser = await getSessionUser();

  // 2. Fall back to Bearer / query secret.
  let bearerOk = false;
  if (!sessionUser) {
    const authFail = checkAuth(req);
    if (authFail) {
      log.warn("auth_denied", { route: opts.route, requestId, reason: authFail.reason });
      return { deny: withId(authFail.response, requestId), requestId, user: null };
    }
    bearerOk = true;
  }

  const ip = clientIp(req);
  // Authenticated users get their own bucket, keyed by user id; machine
  // callers share an IP-keyed bucket.
  const bucketKey = `${opts.route}:${sessionUser ? `u:${sessionUser.id}` : `ip:${ip}`}`;
  const rl = rateLimit(bucketKey, opts.limit);
  if (!rl.ok) {
    log.warn("rate_limited", {
      route: opts.route,
      requestId,
      ip,
      user: sessionUser?.email,
      retryAfterSec: rl.retryAfterSec,
    });
    const res = Response.json(
      { error: "rate_limited", retry_after_sec: rl.retryAfterSec },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
    return { deny: withId(res, requestId), requestId, user: null };
  }

  log.info("request", {
    route: opts.route,
    requestId,
    ip,
    user: sessionUser?.email ?? null,
    via: sessionUser ? "session" : bearerOk ? "bearer" : "none",
  });
  return { deny: null, requestId, user: sessionUser };
}

function withId(res: Response, requestId: string): Response {
  const headers = new Headers(res.headers);
  headers.set("X-Request-Id", requestId);
  return new Response(res.body, { status: res.status, headers });
}

export function jsonWithId<T>(data: T, requestId: string, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  headers.set("X-Request-Id", requestId);
  return new Response(JSON.stringify(data), { ...init, headers });
}
