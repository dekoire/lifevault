import { createClient } from "@supabase/supabase-js";

/**
 * Server: Supabase-Client im Namen des angemeldeten Nutzers (sein Zugangstoken).
 * Damit gelten auch auf dem Server die RLS-Regeln – kein Dienstschlüssel, kein Zugriff auf fremde Daten.
 */
export async function userClient(req: Request) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return undefined;
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data } = await sb.auth.getUser(token);
  return data.user ? { sb, user: data.user } : undefined;
}

export const unauthorized = () => Response.json({ error: "Bitte melde dich an." }, { status: 401 });
