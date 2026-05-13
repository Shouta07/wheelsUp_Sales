// Enforce a Supabase session on page routes when team auth is configured.
//
// Auth-bypassed paths:
//   - /login, /auth/* — the login flow itself
//   - /api/*           — API routes; their own apiGuard handles session OR
//                        Bearer secret. Excluding them here avoids needing
//                        a session for cron / curl callers.
//   - static assets (handled by matcher)
//
// If auth is not configured at all (no NEXT_PUBLIC_SUPABASE_URL), we let
// every request through — that's "mock mode" used in CI / local dev.

import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

const PUBLIC_PREFIXES = ["/login", "/auth", "/api"];

function isPublic(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

function parseAllowList(raw: string | undefined): Set<string> {
  if (!raw) return new Set();
  return new Set(raw.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean));
}

export async function middleware(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  // Auth not configured → run in open mock mode.
  if (!url || !key) return NextResponse.next();

  if (isPublic(req.nextUrl.pathname)) return NextResponse.next();

  let response = NextResponse.next({ request: req });

  const supa = createServerClient(url, key, {
    cookies: {
      getAll() {
        return req.cookies.getAll();
      },
      setAll(toSet) {
        for (const { name, value, options } of toSet) {
          req.cookies.set(name, value);
          response.cookies.set(name, value, options as CookieOptions);
        }
      },
    },
  });

  const {
    data: { user },
  } = await supa.auth.getUser();

  const allow = parseAllowList(process.env.ALLOWED_EMAILS);
  const email = user?.email?.toLowerCase() ?? null;
  const ok = user && email && allow.size > 0 && allow.has(email);

  if (!ok) {
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", req.nextUrl.pathname);
    if (user && email && !allow.has(email)) {
      loginUrl.searchParams.set("reason", "not_allowed");
    }
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

// Skip static assets + Next internals. Everything else is checked.
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|gif|webp|ico)$).*)"],
};
