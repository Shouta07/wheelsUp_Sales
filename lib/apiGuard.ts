// Per-route guard: auth + rate limit + structured logging.
//
// Usage in a route:
//
//   const guard = await guardRequest(req, { route: "crawl", limit: LLM_LIMIT });
//   if (guard.deny) return guard.deny;
//   const { requestId } = guard;

import { checkAuth } from "./auth";
import { clientIp, rateLimit, type RateLimitOptions } from "./ratelimit";
import { log, newRequestId } from "./logger";

export interface GuardOk {
  deny: null;
  requestId: string;
}

export interface GuardDeny {
  deny: Response;
  requestId: string;
}

export type GuardResult = GuardOk | GuardDeny;

export interface GuardOptions {
  route: string;
  limit: RateLimitOptions;
}

export function guardRequest(req: Request, opts: GuardOptions): GuardResult {
  const requestId = newRequestId();

  const authFail = checkAuth(req);
  if (authFail) {
    log.warn("auth_denied", { route: opts.route, requestId, reason: authFail.reason });
    return { deny: withId(authFail.response, requestId), requestId };
  }

  const ip = clientIp(req);
  const rl = rateLimit(`${opts.route}:${ip}`, opts.limit);
  if (!rl.ok) {
    log.warn("rate_limited", { route: opts.route, requestId, ip, retryAfterSec: rl.retryAfterSec });
    const res = Response.json(
      { error: "rate_limited", retry_after_sec: rl.retryAfterSec },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
    return { deny: withId(res, requestId), requestId };
  }

  log.info("request", { route: opts.route, requestId, ip });
  return { deny: null, requestId };
}

function withId(res: Response, requestId: string): Response {
  // Response is immutable once created; rebuild with an extra header.
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
