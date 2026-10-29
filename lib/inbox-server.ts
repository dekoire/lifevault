import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Eigene Empfangsadresse über Resend (Server). Resend nimmt Mails an lv-<token>@finastry.com an und hält sie bereit;
 * abgeholt wird nur im Namen des angemeldeten Nutzers: seine Adresse, seine erlaubten Absender, echte Absender (SPF/DKIM).
 */
export const INBOX_DOMAIN = process.env.INBOX_DOMAIN ?? "finastry.com";
export const PREFIX = "lv-";
const API = "https://api.resend.com";

export type InboxRow = { token: string; allowed: string[] };
type ListItem = { id: string; to: string[] | null; cc?: string[] | null; from: string; created_at: string; subject: string | null };
type Attachment = { id: string; filename: string | null; content_type: string; content_disposition?: string | null; size: number };
export type Received = ListItem & { text: string | null; html: string | null; attachments: Attachment[]; authentication?: { spf?: string; dkim?: string; dmarc?: string } | null };

export const addressOf = (token: string) => `${PREFIX}${token}@${INBOX_DOMAIN}`;
export const bare = (s: string) => (s.match(/<([^>]+)>/)?.[1] ?? s).trim().toLowerCase();

export async function resend<T>(path: string): Promise<T> {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new HttpError(503, "Der Mail-Empfang ist auf dem Server noch nicht eingerichtet (RESEND_API_KEY fehlt).");
  const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${key}` }, cache: "no-store" });
  if (!res.ok) throw new HttpError(502, `Resend antwortet mit Fehler ${res.status}.`);
  return (await res.json()) as T;
}
export class HttpError extends Error { constructor(public status: number, msg: string) { super(msg); } }

export async function myInbox(sb: SupabaseClient): Promise<InboxRow> {
  const { data } = await sb.from("mail_inbox").select("token,allowed").maybeSingle();
  if (!data) throw new HttpError(404, "Noch keine eigene Adresse angelegt.");
  return data as InboxRow;
}

const sentTo = (m: ListItem, addr: string) => [...(m.to ?? []), ...(m.cc ?? [])].some((t) => bare(t) === addr);
/** Echt? Mindestens SPF, DKIM oder DMARC bestanden – sonst könnte jeder einen erlaubten Absender vortäuschen */
const authentic = (m: Received) => !!m.authentication && ["spf", "dkim", "dmarc"].some((k) => m.authentication?.[k as "spf"] === "pass");

/** Prüft eine einzelne Mail; Grund, falls sie nicht übernommen werden darf */
export function rejectReason(m: Received, inbox: InboxRow): string | undefined {
  if (!sentTo(m, addressOf(inbox.token))) return "nicht an deine Adresse";
  if (!inbox.allowed.map((a) => a.toLowerCase()).includes(bare(m.from))) return `Absender ${bare(m.from)} ist nicht erlaubt`;
  if (!authentic(m)) return "Absender nicht bestätigt (SPF/DKIM)";
  return undefined;
}

/**
 * Bestätigung einer Gmail-Weiterleitung (forwarding-noreply@google.com, echt per SPF/DKIM):
 * Link und Code herausziehen, damit man sie in der App mit einem Klick bestätigen kann.
 */
export function gmailConfirmation(m: Received, inbox: InboxRow) {
  if (!sentTo(m, addressOf(inbox.token)) || bare(m.from) !== "forwarding-noreply@google.com" || !authentic(m)) return null;
  const text = `${m.text ?? ""} ${m.html ?? ""}`;
  const link = text.match(/https:\/\/mail(?:-settings)?\.google\.com\/mail\/[^\s"'<>]*vf-[^\s"'<>]+/i)?.[0]?.replace(/&amp;/g, "&");
  const code = (m.subject ?? "").match(/#(\d{6,12})/)?.[1] ?? text.match(/\b(\d{9})\b/)?.[1];
  const forwarder = text.match(/([\w.+-]+@gmail\.com|[\w.+-]+@googlemail\.com)/i)?.[1];
  return link || code ? { link: link ?? null, code: code ?? null, forwarder: forwarder ?? null } : null;
}

/** Mails an die eigene Adresse im Zeitraum (neueste zuerst, höchstens 1000 durchsucht) */
export async function listForInbox(inbox: InboxRow, since: Date, until: Date) {
  const addr = addressOf(inbox.token);
  const hits: ListItem[] = [];
  let after: string | undefined;
  for (let page = 0; page < 10; page++) {
    const r = await resend<{ data: ListItem[]; has_more: boolean }>(`/emails/receiving?limit=100${after ? `&after=${after}` : ""}`);
    let older = false;
    for (const m of r.data) {
      const t = new Date(m.created_at);
      if (t < since) { older = true; continue; }
      if (t <= until && sentTo(m, addr)) hits.push(m);
    }
    if (!r.has_more || older || !r.data.length) break;
    after = r.data[r.data.length - 1].id;
  }
  return hits;
}
