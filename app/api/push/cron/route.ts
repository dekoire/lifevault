import { createClient } from "@supabase/supabase-js";
import { sendPush } from "@/lib/push";

export const maxDuration = 60;

/**
 * Stündlich von Supabase (pg_cron) aufgerufen: fällige Erinnerungen verschicken.
 * Kein Dienstschlüssel – die Datenbank-Funktion push_claim gibt nur mit dem gemeinsamen Geheimnis (CRON_SECRET = Vault „lifevault_cron“) etwas heraus.
 */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  const given = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!secret || secret.length < 16 || given !== secret) return Response.json({ error: "Nicht erlaubt." }, { status: 401 });
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await sb.rpc("push_claim", { p_secret: secret });
  if (error) return Response.json({ error: "Abruf fehlgeschlagen." }, { status: 500 });
  const rows = (data ?? []) as { endpoint: string; p256dh: string; auth: string; title: string; body: string; url: string; tag: string }[];
  let sent = 0;
  for (const r of rows) {
    const res = await sendPush(r, { title: r.title, body: r.body, url: r.url, tag: r.tag });
    if (res === "ok") sent++;
    if (res === "gone") await sb.rpc("push_drop", { p_secret: secret, p_endpoint: r.endpoint });
  }
  return Response.json({ sent, due: rows.length });
}
export const GET = POST;
