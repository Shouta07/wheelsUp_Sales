import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { log } from "@/lib/logger";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const supa = await createSupabaseServer();
  const { data } = await supa.auth.getUser();
  await supa.auth.signOut();
  log.info("auth_signout", { email: data.user?.email ?? null });
  return NextResponse.redirect(new URL("/login", req.url), { status: 303 });
}
