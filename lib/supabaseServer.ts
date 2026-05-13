// Supabase server client factories. Use these inside server components,
// route handlers, and middleware. They wire Supabase Auth cookies through
// Next.js's cookie store so sessions persist across requests.

import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

function env(): { url: string; key: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase Auth not configured (NEXT_PUBLIC_SUPABASE_URL/ANON_KEY)");
  return { url, key };
}

// For server components and route handlers — uses Next.js cookies().
export async function createSupabaseServer(): Promise<SupabaseClient> {
  const { url, key } = env();
  const cookieStore = await cookies();
  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(toSet) {
        // In Server Components cookies() is read-only — swallow the error.
        try {
          for (const { name, value, options } of toSet) {
            cookieStore.set(name, value, options as CookieOptions);
          }
        } catch {
          // not in a writable cookie context (server component); ignore
        }
      },
    },
  });
}
