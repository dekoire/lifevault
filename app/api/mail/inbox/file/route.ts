import { HttpError, myInbox, rejectReason, resend, type Received } from "@/lib/inbox-server";
import { unauthorized, userClient } from "@/lib/server";

export const maxDuration = 60;
const ID = /^[0-9a-f-]{36}$/i;

/** Einen Anhang laden – nur, wenn die Mail an die eigene Adresse ging und vom erlaubten Absender kam */
export async function GET(req: Request) {
  const auth = await userClient(req);
  if (!auth) return unauthorized();
  const u = new URL(req.url);
  const email = u.searchParams.get("email") ?? "", att = u.searchParams.get("att") ?? "";
  if (!ID.test(email) || !ID.test(att)) return Response.json({ error: "Ungültige Anfrage." }, { status: 400 });
  try {
    const inbox = await myInbox(auth.sb);
    const full = await resend<Received>(`/emails/receiving/${email}?html_format=cid`);
    if (rejectReason(full, inbox)) return Response.json({ error: "Kein Zugriff auf diese Mail." }, { status: 403 });
    const a = await resend<{ download_url: string; content_type: string; size: number }>(`/emails/receiving/${email}/attachments/${att}`);
    if (a.size > 25 * 1024 * 1024) return Response.json({ error: "Anhang zu groß." }, { status: 413 });
    const file = await fetch(a.download_url, { cache: "no-store" });
    if (!file.ok) throw new HttpError(502, "Anhang konnte nicht geladen werden.");
    return new Response(file.body, { headers: { "content-type": a.content_type || "application/octet-stream", "cache-control": "no-store" } });
  } catch (e) {
    const err = e instanceof HttpError ? e : new HttpError(500, "Laden fehlgeschlagen.");
    return Response.json({ error: err.message }, { status: err.status });
  }
}
