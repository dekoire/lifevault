import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { loadAiSettings } from "@/lib/ai";
import { gmailConfirmation, listForInbox, originOf, rejectReason, resend, type InboxRow, type Received } from "@/lib/inbox-server";
import { fixMime, htmlToPlain, isCandidate, mailBodyPdf } from "@/lib/mailcore";
import { processDocument } from "@/lib/processDoc";
import { extFor, realMime } from "@/lib/sniff";
import { triageMails } from "@/lib/triage";
import { unifyMailDocs } from "@/lib/unify";
import { applyAging } from "@/lib/agingServer";

/**
 * Mail-Job auf dem Server: holt für jede Weiterleitungsadresse (mit „Automatisch abrufen“) neue Mails ab, ohne dass
 * die App offen ist – aufgerufen vom Zeitplan in Supabase alle 15 Minuten (/api/mail/cron mit CRON_SECRET).
 *
 * AUSNAHME von „nur im Namen des Nutzers“: Hier gibt es kein Login-Token, deshalb arbeitet dieses Modul (und nur dieses)
 * mit dem Service-Role-Key (SUPABASE_SERVICE_ROLE_KEY, nur auf dem Server). Damit trotzdem nichts Fremdes berührt wird,
 * ist jede Abfrage ausdrücklich auf den Besitzer der Adresse begrenzt (user_id), Dateien liegen in seinem Ordner,
 * und dieselben Prüfungen wie in der App gelten: an seine Adresse, erlaubter und echter Absender (SPF/DKIM).
 */
export function adminClient(): SupabaseClient | undefined {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!key || !url) return undefined;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

type JobInbox = InboxRow & { user_id: string; auto_sync: boolean; last_sync_at: string | null; mode: "attachments" | "fallback" | "both" | null };
export type JobResult = { users: number; mails: number; docs: number; cut: boolean; errors: string[] };

const MAX_FILE = 20 * 1024 * 1024;

/** Alle Adressen abarbeiten, bis `deadline` (ms) – der Rest kommt beim nächsten Lauf (schon Übernommenes merkt mail_seen) */
export async function runMailJob(deadline: number): Promise<JobResult> {
  const admin = adminClient();
  if (!admin) throw new Error("SUPABASE_SERVICE_ROLE_KEY fehlt.");
  await loadAiSettings(admin);
  const out: JobResult = { users: 0, mails: 0, docs: 0, cut: false, errors: [] };
  const { data, error } = await admin.from("mail_inbox").select("user_id,token,allowed,auto_sync,last_sync_at,mode").eq("auto_sync", true);
  if (error) throw new Error(error.message);
  // am längsten nicht abgerufene zuerst – so kommt bei vielen Nutzern jeder dran
  const list = ((data ?? []) as JobInbox[]).filter((i) => i.allowed?.length).sort((a, b) => (a.last_sync_at ?? "").localeCompare(b.last_sync_at ?? ""));
  for (const inbox of list) {
    if (Date.now() > deadline) { out.cut = true; break; }
    out.users++;
    try {
      const r = await runInbox(admin, inbox, deadline);
      // Alterung (ohne KI): alte Rechnungen, überholte Änderungen … – läuft so auch ohne offene App
      await applyAging(admin, inbox.user_id).catch(() => undefined);
      out.mails += r.mails;
      out.docs += r.docs;
      if (r.cut) { out.cut = true; break; }
    } catch (e) {
      out.errors.push((e as Error).message.slice(0, 200));
    }
  }
  return out;
}

async function runInbox(admin: SupabaseClient, inbox: JobInbox, deadline: number) {
  const uid = inbox.user_id;
  const now = new Date();
  // seit dem letzten Abruf (1 Stunde Überlappung, Doppelte fängt mail_seen ab); beim ersten Mal 30 Tage
  const since = inbox.last_sync_at ? new Date(Date.parse(inbox.last_sync_at) - 3_600_000) : new Date(now.getTime() - 30 * 86_400_000);
  const mails = (await listForInbox(inbox, since, new Date(now.getTime() + 60_000))).reverse(); // älteste zuerst
  const ids = mails.map((m) => `inbox:${m.id}`);
  const { data: seen } = ids.length ? await admin.from("mail_seen").select("msg_id").eq("user_id", uid).in("msg_id", ids) : { data: [] };
  const known = new Set((seen ?? []).map((s) => s.msg_id as string));
  const out = { mails: 0, docs: 0, cut: false };
  for (const m of mails) {
    if (known.has(`inbox:${m.id}`)) continue;
    // jede Mail braucht bis zu ~1 Minute (Auslesen per KI) – rechtzeitig aufhören
    if (Date.now() > deadline - 60_000) { out.cut = true; break; }
    const full = await resend<Received>(`/emails/receiving/${encodeURIComponent(m.id)}?html_format=cid`);
    // Gmail-Bestätigungen zeigt die App an; Abgelehntes bewusst nicht merken (wird der Absender erlaubt, kommt es mit)
    if (gmailConfirmation(full, inbox) || rejectReason(full, inbox)) continue;
    const r = await importMail(admin, uid, inbox.mode ?? "fallback", full);
    const origin = originOf(full, inbox);
    out.mails++;
    out.docs += r.docIds.length;
    await admin.from("mail_seen").upsert({
      user_id: uid, msg_id: `inbox:${full.id}`, source: "inbox", subject: (full.subject ?? "").slice(0, 500), sender: full.from.slice(0, 300), mail_date: full.created_at,
      relevant: r.docIds.length > 0, reason: r.reason.slice(0, 500), doc_ids: r.docIds,
      forwarded_by: origin.forwardedBy?.slice(0, 300) ?? null, original_from: origin.originalFrom?.slice(0, 300) ?? null, original_to: origin.originalTo,
    });
  }
  // vollständig durch: letzter Abruf = jetzt (sonst bleibt er stehen, der Rest kommt beim nächsten Lauf)
  if (!out.cut) await admin.from("mail_inbox").update({ last_sync_at: now.toISOString(), updated_at: now.toISOString() }).eq("user_id", uid);
  return out;
}

/** Eine Mail übernehmen: passende Anhänge und – je nach Einstellung – den Mailtext als PDF, wenn er ein Beleg ist */
async function importMail(admin: SupabaseClient, uid: string, mode: "attachments" | "fallback" | "both", m: Received): Promise<{ docIds: string[]; reason: string }> {
  const picks = (m.attachments ?? []).filter((a) => isCandidate({ name: a.filename ?? "", mime: fixMime(a.filename ?? "", a.content_type), size: a.size, inline: a.content_disposition === "inline" }));
  const files: { name: string; type: string; bytes: Uint8Array }[] = [];
  let reason = "";
  for (const a of picks) {
    if (a.size > MAX_FILE) continue;
    const meta = await resend<{ download_url: string; content_type: string; size: number }>(`/emails/receiving/${m.id}/attachments/${a.id}`);
    if (!/^https:\/\//.test(meta.download_url ?? "")) continue;
    const res = await fetch(meta.download_url, { cache: "no-store" });
    if (!res.ok) continue;
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.length > MAX_FILE) continue;
    files.push({ name: importName(m.from, a.filename ?? "Anhang"), type: fixMime(a.filename ?? "", a.content_type), bytes });
  }
  // Mailtext: bei „beides“ immer, bei „Anhang, sonst Mailtext“ nur ohne Dokument im Anhang
  if (mode === "both" || (mode === "fallback" && !picks.length)) {
    const bodyText = ((m.html ? htmlToPlain(m.html) : "") || (m.text ?? "").replace(/\r/g, "").trim()).slice(0, 60_000);
    if (bodyText.replace(/\s/g, "").length >= 80) {
      const t = await triageMails({ items: [{ id: m.id, from: m.from, subject: m.subject ?? "", date: m.created_at, snippet: bodyText.slice(0, 300), attachments: [], body: bodyText.slice(0, 3000) }] });
      const res = ((await t.json().catch(() => ({}))) as { results?: { relevant: boolean; reason: string; bodyDocument?: boolean }[] }).results?.[0];
      if (res?.relevant && res.bodyDocument) {
        const pdf = await mailBodyPdf({ from: m.from, subject: m.subject ?? "", date: m.created_at, bodyText });
        files.push({ name: pdf.name, type: "application/pdf", bytes: new Uint8Array(await pdf.arrayBuffer()) });
        reason = res.reason || "Beleg im Mailtext";
      } else if (!files.length) reason = res?.reason ? `Kein Beleg: ${res.reason}` : "Kein Dokument im Anhang";
    }
  }
  if (!files.length) return { docIds: [], reason: reason || (picks.length ? "Anhang konnte nicht geladen werden" : "Kein Dokument im Anhang") };

  const { data: project } = await admin.from("projects").select("id").eq("user_id", uid).eq("is_default", true).maybeSingle();
  const docIds: string[] = [];
  let dropped = 0;
  for (const f of files) {
    const mime = realMime(f.type, f.bytes);
    const ext = extFor(mime) ?? ((/\.([a-z0-9]{1,5})$/i.exec(f.name)?.[1] ?? "bin").toLowerCase());
    const path = `${uid}/${crypto.randomUUID()}.${ext}`;
    const up = await admin.storage.from("documents").upload(path, f.bytes, { contentType: mime });
    if (up.error) continue;
    const { data: row, error } = await admin.from("documents").insert({ user_id: uid, file_path: path, file_name: f.name.slice(0, 200), mime_type: mime, size_bytes: f.bytes.length, from_mail: true, ...(project?.id ? { project_id: project.id } : {}) }).select("id").single();
    if (error || !row) { await admin.storage.from("documents").remove([path]); continue; }
    docIds.push(row.id);
    // auslesen; mehrere Briefe in einer PDF werden dabei getrennt – dann die Teile auslesen
    const res = await processDocument(admin, uid, { id: row.id });
    const json = (await res.json().catch(() => ({}))) as { split?: string[]; dropped?: boolean };
    // nach den Regeln nicht behalten (z. B. bezahlter Kauf): schon wieder gelöscht
    if (json.dropped) { docIds.pop(); dropped++; continue; }
    for (const part of json.split ?? []) await processDocument(admin, uid, { id: part, split: false });
  }
  // alles aus einer Mail gehört zusammen → gleicher Partner
  if (docIds.length > 1) await unifyMailDocs(admin, uid, { ids: docIds, subject: m.subject ?? "", from: m.from }).catch(() => undefined);
  if (!docIds.length && dropped) return { docIds, reason: "Nicht gespeichert (deine Regeln, z. B. bezahlter Kauf)" };
  return { docIds, reason: reason || "An deine Lifevault-Adresse geschickt" };
}

/** Dateiname: Originalname, bei generischen Namen mit Absender davor (wie im Browser) */
function importName(from: string, name: string) {
  const sender = from.replace(/<.*>/, "").replace(/["']/g, "").trim() || from.replace(/.*@/, "").replace(/>.*/, "");
  return /^(attachment|anhang|document|dokument|scan|file|datei|unnamed|image)?[-_ ]?\d*\.\w+$/i.test(name) ? `${sender} – ${name}`.slice(0, 180) : name;
}
