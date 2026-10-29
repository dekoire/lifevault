import { gmailConfirmation, HttpError, listForInbox, myInbox, rejectReason, resend, type Received } from "@/lib/inbox-server";
import { unauthorized, userClient } from "@/lib/server";

export const maxDuration = 60;

/** Mails an die eigene Adresse abholen (nur Metadaten + Anhangsliste); Dateien kommen einzeln über /file */
export async function POST(req: Request) {
  const auth = await userClient(req);
  if (!auth) return unauthorized();
  const body = (await req.json().catch(() => ({}))) as { since?: string; until?: string };
  const since = body.since && !Number.isNaN(Date.parse(body.since)) ? new Date(body.since) : new Date(Date.now() - 30 * 86_400_000);
  const until = body.until && !Number.isNaN(Date.parse(body.until)) ? new Date(body.until) : new Date(Date.now() + 3_600_000);
  try {
    const inbox = await myInbox(auth.sb);
    const list = await listForInbox(inbox, since, until);
    const items: unknown[] = [];
    const rejected: { subject: string; from: string; reason: string }[] = [];
    const confirmations: { id: string; date: string; link: string | null; code: string | null; forwarder: string | null }[] = [];
    for (const m of list.slice(0, 200)) {
      const full = await resend<Received>(`/emails/receiving/${encodeURIComponent(m.id)}?html_format=cid`);
      const conf = gmailConfirmation(full, inbox);
      if (conf) { confirmations.push({ id: full.id, date: full.created_at, ...conf }); continue; }
      const why = rejectReason(full, inbox);
      if (why) { rejected.push({ subject: full.subject ?? "", from: full.from, reason: why }); continue; }
      items.push({
        id: full.id, from: full.from, subject: full.subject ?? "", date: full.created_at,
        snippet: (full.text ?? full.html?.replace(/<[^>]+>/g, " ") ?? "").replace(/\s+/g, " ").trim().slice(0, 300),
        attachments: (full.attachments ?? []).map((a) => ({ id: a.id, name: a.filename ?? "Anhang", mime: a.content_type, size: a.size, inline: a.content_disposition === "inline" })),
      });
    }
    return Response.json({ items, rejected, confirmations });
  } catch (e) {
    const err = e instanceof HttpError ? e : new HttpError(500, "Abruf fehlgeschlagen.");
    return Response.json({ error: err.message }, { status: err.status });
  }
}
