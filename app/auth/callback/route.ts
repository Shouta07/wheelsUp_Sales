import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { isEmailAllowed } from "@/lib/sessionAuth";
import { log } from "@/lib/logger";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") || "/";

  if (!code) {
    return NextResponse.redirect(new URL("/login?reason=missing_code", req.url));
  }

  const supa = await createSupabaseServer();
  const { error } = await supa.auth.exchangeCodeForSession(code);
  if (error) {
    log.warn("auth_callback_exchange_failed", { err: error.message });
    return NextResponse.redirect(new URL("/login?reason=exchange_failed", req.url));
  }

  const { data } = await supa.auth.getUser();
  const email = data.user?.email ?? null;
  if (!isEmailAllowed(email)) {
    // Drop the just-issued session — they're not on the allow list.
    await supa.auth.signOut();
    log.warn("auth_callback_not_allowed", { email });
    return NextResponse.redirect(new URL("/login?reason=not_allowed", req.url));
  }

  log.info("auth_signin", { email });
  return NextResponse.redirect(new URL(next, req.url));
}
