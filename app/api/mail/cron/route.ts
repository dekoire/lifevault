import { timingSafeEqual } from "node:crypto";
import { runMailJob } from "@/lib/mailjob";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * Mail-Job (lib/mailjob.ts): vom Zeitplan in Supabase alle 15 Minuten aufgerufen, mit CRON_SECRET als Bearer-Token.
 * Holt neue Mails aller Weiterleitungsadressen ab, legt sie ab und liest sie aus – ohne offene App.
 */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  const got = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!secret || got.length !== secret.length || !timingSafeEqual(Buffer.from(got), Buffer.from(secret))) return Response.json({ error: "Nicht erlaubt." }, { status: 401 });
  try {
    // Puffer bis zur Höchstlaufzeit lassen
    return Response.json(await runMailJob(Date.now() + 240_000));
  } catch (e) {
    console.error("mail cron", (e as Error).message);
    return Response.json({ error: (e as Error).message }, { status: 503 });
  }
}
