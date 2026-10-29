import { HttpError, myInbox, rejectReason, resend, type Received } from "@/lib/inbox-server";
import { unauthorized, userClient } from "@/lib/server";

export const maxDuration = 60;
const ID = /^[0-9a-f-]{36}$/i;

/** Mailtext einer Mail laden (für Belege ohne Anhang, z. B. Apple) – nur an die eigene Adresse und vom erlaubten, echten Absender */
export async function GET(req: Request) {
  const auth = await userClient(req);
  if (!auth) return unauthorized();
  const email = new URL(req.url).searchParams.get("email") ?? "";
  if (!ID.test(email)) return Response.json({ error: "Ungültige Anfrage." }, { status: 400 });
  try {
    const inbox = await myInbox(auth.sb);
    const full = await resend<Received>(`/emails/receiving/${email}?html_format=cid`);
    if (rejectReason(full, inbox)) return Response.json({ error: "Kein Zugriff auf diese Mail." }, { status: 403 });
    return Response.json({ text: (full.text ?? "").slice(0, 200_000), html: (full.html ?? "").slice(0, 500_000) }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    const err = e instanceof HttpError ? e : new HttpError(500, "Laden fehlgeschlagen.");
    return Response.json({ error: err.message }, { status: err.status });
  }
}
