import { HttpError, myInbox, originOf, rejectReason, resend, type Received } from "@/lib/inbox-server";
import { unauthorized, userClient } from "@/lib/server";

export const maxDuration = 30;
const ID = /^[0-9a-f-]{36}$/i;

/**
 * Herkunft einer früher importierten Mail nachtragen (Weiterleiter, ursprünglicher Absender und Empfänger) – für Dokumente,
 * die vor dieser Anzeige kamen. Nur die eigene Mail; gespeichert wird im Namen des Nutzers in mail_seen.
 */
export async function POST(req: Request) {
  const auth = await userClient(req);
  if (!auth) return unauthorized();
  const { email } = (await req.json().catch(() => ({}))) as { email?: unknown };
  if (typeof email !== "string" || !ID.test(email)) return Response.json({ error: "Ungültige Anfrage." }, { status: 400 });
  try {
    const inbox = await myInbox(auth.sb);
    const full = await resend<Received>(`/emails/receiving/${email}`);
    if (rejectReason(full, inbox)) return Response.json({ error: "Kein Zugriff auf diese Mail." }, { status: 403 });
    const o = originOf(full, inbox);
    await auth.sb.from("mail_seen").update({ forwarded_by: o.forwardedBy?.slice(0, 300) ?? null, original_from: o.originalFrom?.slice(0, 300) ?? null, original_to: o.originalTo }).eq("msg_id", `inbox:${email}`);
    return Response.json(o, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    const err = e instanceof HttpError ? e : new HttpError(500, "Laden fehlgeschlagen.");
    return Response.json({ error: err.message }, { status: err.status });
  }
}
