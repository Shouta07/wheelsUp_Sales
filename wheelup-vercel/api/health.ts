import type { VercelRequest, VercelResponse } from "@vercel/node";

export default function handler(_req: VercelRequest, res: VercelResponse) {
  return res.json({
    ok: true,
    env: {
      SUPABASE_URL: process.env.SUPABASE_URL ? "set" : "MISSING",
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ? "set" : "MISSING",
      VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL ? "set" : "MISSING",
    },
  });
}
