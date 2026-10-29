"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useDocs } from "@/lib/docs";
import { startJob, updateJob } from "@/lib/jobs";
import { fixMime, isCandidate } from "@/lib/mail";
import { authFetch, supabase, useSession } from "@/lib/supabase";

/**
 * Eigene Empfangsadresse lv-<token>@finastry.com: Mails dorthin weiterleiten, Lifevault holt die Anhänge ab.
 * Nur erlaubte Absender (und echte, per SPF/DKIM bestätigte). Automatisch: beim Öffnen und alle 10 Minuten, nur das Neue seit dem letzten Abruf.
 */
export const INBOX_DOMAIN = process.env.NEXT_PUBLIC_INBOX_DOMAIN ?? "finastry.com";
export type Inbox = { token: string; allowed: string[]; auto_sync: boolean; last_sync_at: string | null };
export const inboxAddress = (token: string) => `lv-${token}@${INBOX_DOMAIN}`;
const EVERY_MIN = 10;

const newToken = () => Array.from(crypto.getRandomValues(new Uint8Array(10)), (b) => "abcdefghjkmnpqrstuvwxyz23456789"[b % 31]).join("");

export function useInbox() {
  const session = useSession();
  const [inbox, setInbox] = useState<Inbox | null>();
  const load = useCallback(async () => {
    const { data } = await supabase.from("mail_inbox").select("token,allowed,auto_sync,last_sync_at").maybeSingle();
    setInbox((data as Inbox) ?? null);
  }, []);
  useEffect(() => {
    if (!session) return;
    void load();
    const on = () => void load();
    window.addEventListener("lifevault:inbox", on);
    return () => window.removeEventListener("lifevault:inbox", on);
  }, [session, load]);
  const changed = () => window.dispatchEvent(new Event("lifevault:inbox"));
  /** Adresse anlegen; erlaubt ist zuerst die eigene Login-Adresse */
  const create = async () => {
    const own = session?.user.email?.toLowerCase();
    for (let i = 0; i < 3; i++) {
      const { error } = await supabase.from("mail_inbox").insert({ token: newToken(), allowed: own ? [own] : [] });
      if (!error) break;
    }
    changed();
  };
  const save = async (patch: Partial<Inbox>) => {
    setInbox((cur) => (cur ? { ...cur, ...patch } : cur));
    await supabase.from("mail_inbox").update({ ...patch, updated_at: new Date().toISOString() }).not("user_id", "is", null);
    changed();
  };
  /** Neue Adresse: die alte nimmt dann nichts mehr an */
  const renew = () => save({ token: newToken() });
  return { inbox, create, save, renew, reload: load };
}

type Item = { id: string; from: string; subject: string; date: string; snippet: string; attachments: { id: string; name: string; mime: string; size: number; inline: boolean }[] };
/* Gmail-Weiterleitung bestätigen: erkannte Bestätigungs-Mails merken, bis man sie erledigt hat */
export type Confirmation = { id: string; date: string; link: string | null; code: string | null; forwarder: string | null };
const CONF = "lifevault:gmail-confirm", CONF_DONE = "lifevault:gmail-confirm-done";
const readJson = <T,>(k: string, d: T): T => { try { return JSON.parse(localStorage.getItem(k) ?? "") as T; } catch { return d; } };
function rememberConfirmations(list: Confirmation[]) {
  const done = readJson<string[]>(CONF_DONE, []);
  const cur = readJson<Confirmation[]>(CONF, []);
  const next = [...cur, ...list.filter((c) => !done.includes(c.id) && !cur.some((x) => x.id === c.id))];
  try { localStorage.setItem(CONF, JSON.stringify(next)); } catch { /* egal */ }
  window.dispatchEvent(new Event("lifevault:gmail-confirm"));
}
export function useConfirmations() {
  const [list, setList] = useState<Confirmation[]>([]);
  useEffect(() => {
    const load = () => setList(readJson<Confirmation[]>(CONF, []));
    load();
    window.addEventListener("lifevault:gmail-confirm", load);
    return () => window.removeEventListener("lifevault:gmail-confirm", load);
  }, []);
  const done = (id: string) => {
    try {
      localStorage.setItem(CONF_DONE, JSON.stringify([...readJson<string[]>(CONF_DONE, []), id]));
      localStorage.setItem(CONF, JSON.stringify(readJson<Confirmation[]>(CONF, []).filter((c) => c.id !== id)));
    } catch { /* egal */ }
    window.dispatchEvent(new Event("lifevault:gmail-confirm"));
  };
  return { list, done };
}

export type InboxResult = { checked: number; imported: number; files: number; known: number; withoutDocs: number; rejected: { subject: string; from: string; reason: string }[] };

/** Abholen und importieren. Ohne KI-Vorprüfung: was du selbst schickst, willst du auch haben (nur Logos/Deko fallen raus). */
export async function importInbox(opts: { since: Date; until?: Date; upload: (files: File[], o?: { silent?: boolean }) => Promise<string[]>; silent?: boolean; advance?: boolean; onStep?: (s: string, done?: number, total?: number) => void }): Promise<InboxResult> {
  const { since, until, upload, onStep } = opts;
  onStep?.("Mails abrufen");
  const res = await authFetch("/api/mail/inbox", { method: "POST", body: JSON.stringify({ since: since.toISOString(), until: until?.toISOString() }) });
  const json = (await res.json().catch(() => ({}))) as { items?: Item[]; rejected?: InboxResult["rejected"]; confirmations?: Confirmation[]; error?: string };
  if (json.confirmations?.length) rememberConfirmations(json.confirmations);
  if (!res.ok || json.error) throw new Error(json.error ?? `Fehler ${res.status}`);
  const items = json.items ?? [];
  const ids = items.map((m) => `inbox:${m.id}`);
  const { data: seen } = ids.length ? await supabase.from("mail_seen").select("msg_id").in("msg_id", ids) : { data: [] };
  const known = new Set((seen ?? []).map((s) => s.msg_id as string));
  const fresh = items.filter((m) => !known.has(`inbox:${m.id}`));
  const out: InboxResult = { checked: items.length, imported: 0, files: 0, known: items.length - fresh.length, withoutDocs: 0, rejected: json.rejected ?? [] };
  let n = 0;
  // sichtbarer Fortschritt (lila Karte unten rechts), sobald es Neues gibt
  const job = fresh.length ? startJob({ kind: "mail", title: "E-Mails werden verarbeitet", detail: `${fresh.length} neue ${fresh.length === 1 ? "Mail" : "Mails"}`, total: fresh.length }) : null;
  try {
    for (const m of fresh) {
      onStep?.("Anhänge übernehmen", n++, fresh.length);
      if (job) updateJob(job, { done: n - 1 });
      const picks = m.attachments.filter((a) => isCandidate({ name: a.name, mime: fixMime(a.name, a.mime), size: a.size, inline: a.inline }));
      let docIds: string[] = [];
      if (picks.length) {
        const files: File[] = [];
        for (const a of picks) {
          const r = await authFetch(`/api/mail/inbox/file?email=${m.id}&att=${a.id}`);
          if (r.ok) files.push(new File([await r.blob()], a.name, { type: fixMime(a.name, a.mime) }));
        }
        docIds = files.length ? await upload(files, { silent: opts.silent }) : [];
        if (docIds.length) { out.imported++; out.files += docIds.length; }
      } else out.withoutDocs++;
      await supabase.from("mail_seen").upsert({
        msg_id: `inbox:${m.id}`, source: "inbox", subject: m.subject.slice(0, 500), sender: m.from.slice(0, 300), mail_date: m.date,
        relevant: docIds.length > 0, reason: (docIds.length ? "An deine Lifevault-Adresse geschickt" : picks.length ? "Anhang konnte nicht geladen werden" : "Kein Dokument im Anhang").slice(0, 500), doc_ids: docIds,
      });
    }
  } catch (e) {
    if (job) updateJob(job, { state: "error", title: "E-Mail-Abruf unterbrochen", detail: (e as Error).message });
    throw e;
  }
  if (job) updateJob(job, { done: fresh.length, state: "done", title: "E-Mails übernommen", detail: out.files ? `${out.files} ${out.files === 1 ? "Dokument" : "Dokumente"} aus ${out.imported} ${out.imported === 1 ? "Mail" : "Mails"}` : "Keine Dokumente im Anhang" });
  if (opts.advance !== false) await supabase.from("mail_inbox").update({ last_sync_at: new Date().toISOString() }).not("user_id", "is", null);
  window.dispatchEvent(new Event("lifevault:inbox"));
  onStep?.("Fertig", fresh.length, fresh.length);
  return out;
}

/** Läuft im App-Rahmen: holt automatisch ab, solange die App offen ist */
export function InboxAutoSync() {
  const { inbox } = useInbox();
  const { upload } = useDocs();
  const busy = useRef(false);
  useEffect(() => {
    if (!inbox?.auto_sync) return;
    const tick = async () => {
      if (busy.current || document.visibilityState !== "visible") return;
      const last = inbox.last_sync_at ? new Date(inbox.last_sync_at) : null;
      if (last && Date.now() - last.getTime() < EVERY_MIN * 60_000) return;
      busy.current = true;
      // nur die Differenz seit dem letzten Abruf (1 Stunde Überlappung, Doppelte fängt mail_seen ab); beim ersten Mal 30 Tage
      try { await importInbox({ since: last ? new Date(last.getTime() - 3_600_000) : new Date(Date.now() - 30 * 86_400_000), upload, silent: true }); }
      catch { /* nächster Versuch beim nächsten Takt */ }
      finally { busy.current = false; }
    };
    void tick();
    const t = setInterval(() => void tick(), 60_000);
    document.addEventListener("visibilitychange", tick);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", tick); };
  }, [inbox, upload]);
  return null;
}
