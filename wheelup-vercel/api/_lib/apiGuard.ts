// Composed per-route guard: requestId + auth + rate limit + structured log.
//
// Use at the top of every protected handler:
//
//   const g = await guardRequest(req, res, { route: "meetings.list", limit: READ_LIMIT });
//   if (g.deny) return; // response already sent
//   const { requestId, user } = g;

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { checkAuth, type SessionUser } from "./auth.ts";
import { clientIp, rateLimit, type RateLimitOptions } from "./ratelimit.ts";
import { log, newRequestId } from "./logger.ts";

export interface GuardOk {
  deny: false;
  requestId: string;
  user: SessionUser | null;
}
export interface GuardDeny {
  deny: true;
  requestId: string;
}
export type GuardResult = GuardOk | GuardDeny;

export interface GuardOptions {
  route: string;
  limit: RateLimitOptions;
}

export async function guardRequest(
  req: VercelRequest,
  res: VercelResponse,
  opts: GuardOptions,
): Promise<GuardResult> {
  const requestId = newRequestId();
  res.setHeader("X-Request-Id", requestId);

  const auth = await checkAuth(req);
  if (!auth.ok) {
    log.warn("auth_denied", { route: opts.route, requestId, reason: auth.reason });
    if (auth.status === 500) {
      res.status(500).json({ error: "server_misconfigured" });
    } else {
      res.status(401).json({ error: "unauthorized" });
    }
    return { deny: true, requestId };
  }

  const ip = clientIp(req);
  const bucketKey = `${opts.route}:${auth.user ? `u:${auth.user.id}` : `ip:${ip}`}`;
  const rl = rateLimit(bucketKey, opts.limit);
  if (!rl.ok) {
    log.warn("rate_limited", {
      route: opts.route,
      requestId,
      ip,
      user: auth.user?.email,
      retryAfterSec: rl.retryAfterSec,
    });
    res.setHeader("Retry-After", String(rl.retryAfterSec));
    res.status(429).json({ error: "rate_limited", retry_after_sec: rl.retryAfterSec });
    return { deny: true, requestId };
  }

  log.info("request", {
    route: opts.route,
    requestId,
    ip,
    user: auth.user?.email ?? null,
    via: auth.via,
  });
  return { deny: false, requestId, user: auth.user };
}
