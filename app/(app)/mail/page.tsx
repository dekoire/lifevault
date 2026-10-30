"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, FileUp, Inbox, Loader2, Mail, Paperclip, RefreshCw, Sparkles, X } from "lucide-react";
import { InboxCard } from "@/components/settings/InboxCard";
import { BackLink, CARD, PageHeader } from "@/components/ui";
import { fmtDate, useDocs } from "@/lib/docs";
import { GMAIL_CLIENT_ID, gmailMessage, gmailProfile, gmailSearch, gmailToken, importName, mailBodyPdf, parseMailFiles, pool, type MailItem } from "@/lib/mail";
import { authFetch, supabase, useSession } from "@/lib/supabase";

type Seen = { msg_id: string; source: string; subject: string | null; sender: string | null; mail_date: string | null; relevant: boolean | null; reason: string | null; doc_ids: string[]; created_at: string };
/** body: der Mailtext selbst ist der Beleg (z. B. Apple-Rechnung ohne PDF) – wird als PDF abgelegt */
type Row = { m: MailItem; relevant: boolean; reason: string; pick: number[]; body: boolean; state: "neu" | "importiert" | "übersprungen" | "fehler" | "läuft" };
type Phase = { step: string; done?: number; total?: number } | null;

const MAX_MAILS = 400;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const daysAgo = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return d; };
const senderName = (f: string) => f.replace(/<.*>/, "").replace(/["']/g, "").trim() || f.replace(/[<>]/g, "");

/** E-Mail-Import: Gmail und Mail-Dateien (Proton Mail) – günstige KI sortiert vor, Relevantes kommt in den Tresor */
export default function MailPage() {
  const session = useSession();
  const { upload } = useDocs();
  const [sources, setSources] = useState<{ source: string; last_sync_at: string | null }[]>([]);
  const [seen, setSeen] = useState<Seen[]>([]);
  const [mode, setMode] = useState<"since" | "range">("since");
  const [from, setFrom] = useState(iso(daysAgo(90)));
  const [to, setTo] = useState(iso(new Date()));
  const [phase, setPhase] = useState<Phase>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string>();
  const [showSkipped, setShowSkipped] = useState(false);
  const [drag, setDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    const [s, m] = await Promise.all([
      supabase.from("mail_sources").select("source,last_sync_at"),
      supabase.from("mail_seen").select("msg_id,source,subject,sender,mail_date,relevant,reason,doc_ids,created_at").order("created_at", { ascending: false }).limit(1000),
    ]);
    setSources(s.data ?? []);
    setSeen((m.data as Seen[]) ?? []);
  };
  useEffect(() => { if (session) void load(); }, [session]);

  const gmail = sources.find((s) => s.source.startsWith("gmail:"));
  const lastSync = (src?: { last_sync_at: string | null }) => (src?.last_sync_at ? new Date(src.last_sync_at) : null);
  const range = (src?: { last_sync_at: string | null }) => {
    const last = lastSync(src);
    // seit letztem Abruf (1 Tag Überlappung, Doppelte fängt mail_seen ab); erster Abruf: 90 Tage
    if (mode === "since") return { start: last ? new Date(last.getTime() - 86_400_000) : daysAgo(90), end: new Date(Date.now() + 86_400_000) };
    const end = new Date(`${to}T00:00:00`); end.setDate(end.getDate() + 1);
    return { start: new Date(`${from}T00:00:00`), end };
  };
  const seenIds = useMemo(() => new Set(seen.map((s) => s.msg_id)), [seen]);

  /** Vorprüfung in Paketen, dann relevante Anhänge hochladen */
  const run = async (items: MailItem[], source: string, syncedUntil?: Date) => {
    // auch Mails ohne Anhang, wenn sie Text haben – die KI prüft, ob der Mailtext selbst ein Beleg ist
    const hasBody = (m: MailItem) => (m.bodyText ?? "").replace(/\s/g, "").length > 80;
    const fresh = items.filter((m) => (m.attachments.length || hasBody(m)) && !seenIds.has(m.id));
    const skippedKnown = items.filter((m) => seenIds.has(m.id)).length;
    const noDocs = items.filter((m) => !m.attachments.length && !hasBody(m) && !seenIds.has(m.id));
    setRows([]);
    if (!fresh.length) {
      setPhase({ step: items.length ? `Nichts Neues: ${skippedKnown} schon geprüft, ${noDocs.length} ohne Dokument-Anhang.` : "Keine Mails mit Anhang im Zeitraum." });
      await markSync(source, syncedUntil);
      return;
    }
    const out: Row[] = [];
    const chunks: MailItem[][] = [];
    for (let i = 0; i < fresh.length; i += 25) chunks.push(fresh.slice(i, i + 25));
    let checked = 0;
    setPhase({ step: "KI prüft", done: 0, total: fresh.length });
    await pool(chunks, 2, async (chunk) => {
      const res = await authFetch("/api/mail/triage", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ items: chunk.map((m) => ({ id: m.id, from: m.from, subject: m.subject, date: m.date, snippet: m.snippet, attachments: m.attachments.map((a) => ({ name: a.name, mime: a.mime, size: a.size })), ...(!m.attachments.length && m.bodyText ? { body: m.bodyText.slice(0, 1500) } : {}) })) }) });
      const json = (await res.json().catch(() => ({}))) as { results?: { id: string; relevant: boolean; reason: string; attachments: number[]; bodyDocument?: boolean }[]; error?: string };
      if (!res.ok || json.error) throw new Error(json.error ?? `Fehler ${res.status}`);
      for (const m of chunk) {
        const r = json.results?.find((x) => x.id === m.id);
        const pick = (r?.attachments ?? []).filter((i) => i >= 0 && i < m.attachments.length);
        const body = !!r?.relevant && !!r.bodyDocument && hasBody(m) && !pick.length;
        out.push({ m, relevant: !!r?.relevant && (pick.length > 0 || body), reason: r?.reason ?? "nicht bewertet", pick: r?.relevant && !body ? (pick.length ? pick : m.attachments.map((_, i) => i)) : [], body, state: "neu" });
      }
      checked += chunk.length;
      setPhase({ step: "KI prüft", done: checked, total: fresh.length });
    });
    out.sort((a, b) => b.m.date.localeCompare(a.m.date));
    setRows(out);
    // nicht relevante gleich merken; relevante werden importiert
    await remember(out.filter((r) => !r.relevant), []);
    const rel = out.filter((r) => r.relevant);
    let n = 0;
    setPhase({ step: "Importiert", done: 0, total: rel.length });
    for (const r of rel) { await importRow(r); setPhase({ step: "Importiert", done: ++n, total: rel.length }); }
    await markSync(source, syncedUntil);
    setPhase({ step: `Fertig: ${rel.length} ${rel.length === 1 ? "Mail" : "Mails"} importiert, ${out.length - rel.length} übersprungen${skippedKnown ? `, ${skippedKnown} schon bekannt` : ""}.` });
    await load();
  };

  const patch = (id: string, p: Partial<Row>) => setRows((rs) => rs.map((r) => (r.m.id === id ? { ...r, ...p } : r)));
  const remember = async (list: Row[], docIds: string[][]) => {
    if (!list.length) return;
    await supabase.from("mail_seen").upsert(list.map((r, i) => ({ msg_id: r.m.id, source: r.m.source, subject: r.m.subject.slice(0, 500), sender: r.m.from.slice(0, 300), mail_date: r.m.date || null, relevant: r.relevant, reason: r.reason.slice(0, 500), doc_ids: docIds[i] ?? [] })));
  };
  const importRow = async (r: Row, indices = r.pick, body = r.body) => {
    patch(r.m.id, { state: "läuft" });
    try {
      const files: File[] = [];
      for (const i of indices) { const a = r.m.attachments[i]; files.push(new File([await a.load()], importName(r.m, a), { type: a.mime })); }
      // Beleg nur im Mailtext (z. B. Apple): Mail als PDF ablegen, sie wird dann wie jedes Dokument ausgelesen
      if (body && r.m.bodyText) files.push(await mailBodyPdf(r.m));
      const ids = await upload(files);
      await remember([{ ...r, relevant: true }], [ids]);
      patch(r.m.id, { state: ids.length ? "importiert" : "fehler", relevant: true, pick: indices, body });
    } catch (e) {
      console.error(e);
      patch(r.m.id, { state: "fehler" });
    }
  };
  const markSync = async (source: string, until?: Date) => {
    if (!until) return;
    await supabase.from("mail_sources").upsert({ source, last_sync_at: until.toISOString(), updated_at: new Date().toISOString() });
  };

  const runGmail = async () => {
    setError(undefined);
    try {
      setPhase({ step: "Google-Anmeldung" });
      const token = await gmailToken(gmail?.source.slice(6));
      const { emailAddress } = await gmailProfile(token);
      const source = `gmail:${emailAddress}`;
      const known = sources.find((s) => s.source === source);
      const { start, end } = range(known);
      setPhase({ step: "Mails mit Anhang oder Beleg suchen", done: 0 });
      const ids = await gmailSearch(token, start, end, MAX_MAILS, (n) => setPhase({ step: "Mails mit Anhang oder Beleg suchen", done: n }));
      const fresh = ids.filter((id) => !seenIds.has(`gmail:${id}`));
      let n = 0;
      setPhase({ step: "Mails lesen", done: 0, total: fresh.length });
      const items = await pool(fresh, 6, async (id) => { const m = await gmailMessage(token, id, source); setPhase({ step: "Mails lesen", done: ++n, total: fresh.length }); return m; });
      // „seit letztem Abruf“ rückt nur vor, wenn nicht gekappt wurde
      await run([...items, ...ids.filter((id) => seenIds.has(`gmail:${id}`)).map((id) => ({ id: `gmail:${id}`, source, from: "", subject: "", date: "", snippet: "", attachments: [] }))], source, ids.length < MAX_MAILS ? (mode === "since" ? new Date() : undefined) : undefined);
      if (ids.length >= MAX_MAILS) setError(`Es gab mehr als ${MAX_MAILS} Mails mit Anhang. Die neuesten ${MAX_MAILS} wurden geprüft – für den Rest einen früheren Zeitraum wählen.`);
    } catch (e) {
      setError((e as Error).message);
      setPhase(null);
    }
  };

  const runFiles = async (files: File[]) => {
    setError(undefined);
    const mails = files.filter((f) => /\.(eml|mbox)$/i.test(f.name) || f.type === "message/rfc822");
    if (!mails.length) { setError("Bitte .eml- oder .mbox-Dateien wählen."); return; }
    try {
      setPhase({ step: "Mails lesen", done: 0 });
      const all = await parseMailFiles(mails, (n) => setPhase({ step: "Mails lesen", done: n }));
      const { start, end } = mode === "range" ? range() : { start: new Date(0), end: new Date(8.64e15) };
      await run(all.filter((m) => !m.date || (new Date(m.date) >= start && new Date(m.date) < end)), "eml", new Date());
    } catch (e) {
      setError((e as Error).message);
      setPhase(null);
    }
  };

  const relevant = rows.filter((r) => r.relevant);
  const skipped = rows.filter((r) => !r.relevant);
  const busy = !!phase && (phase.total === undefined || (phase.done ?? 0) < phase.total) && !phase.step.startsWith("Fertig") && !phase.step.startsWith("Nichts") && !phase.step.startsWith("Keine");
  const recent = seen.filter((s) => s.relevant).slice(0, 12);

  return (
    <>
      <BackLink href="/einstellungen" label="Einstellungen" />
      <PageHeader title="E-Mail-Import" subtitle="Rechnungen, Angebote, Verträge & Co. aus deinem Postfach holen – eine günstige KI sortiert vor" />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <InboxCard mode={mode} from={from} to={to} />

        {/* Zeitraum */}
        <section className={`${CARD} p-5 lg:col-span-2`}>
          <h2 className="text-[15px] font-semibold">Zeitraum</h2>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {(["since", "range"] as const).map((m) => (
              <button key={m} type="button" onClick={() => setMode(m)} className={`inline-flex h-9 items-center rounded-full px-4 text-[13px] font-semibold ${mode === m ? "bg-fg text-canvas" : "border border-card-line text-soft hover:text-fg"}`}>{m === "since" ? "Seit letztem Abruf" : "Eigener Zeitraum"}</button>
            ))}
            {mode === "range" && (
              <span className="flex flex-wrap items-center gap-2 text-[13px]">
                <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="h-9 rounded-full border border-card-line bg-surface px-3" />
                <span className="text-muted">bis</span>
                <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className="h-9 rounded-full border border-card-line bg-surface px-3" />
              </span>
            )}
          </div>
          <p className="mt-2 text-[13px] text-muted">{mode === "since" ? "Gilt für alle Quellen. Holt alles seit dem letzten Abruf je Postfach. Beim ersten Mal: die letzten 90 Tage. Schon geprüfte Mails werden übersprungen." : "Durchsucht genau diesen Zeitraum. Schon geprüfte Mails werden übersprungen."}</p>
        </section>

        {/* Gmail */}
        <section className={`${CARD} flex flex-col p-5`}>
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-surface-2"><Mail size={20} /></span>
            <div className="min-w-0 flex-1">
              <h2 className="text-[18px] leading-[26px] font-semibold">Gmail</h2>
              <p className="truncate text-[13px] text-muted">{gmail ? `${gmail.source.slice(6)} · zuletzt ${lastSync(gmail)?.toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" }) ?? "–"}` : "Noch nicht abgerufen"}</p>
            </div>
          </div>
          <p className="mt-3 flex-1 text-[13px] text-soft">Google fragt einmal nach Erlaubnis (nur Lesen). Der Zugang gilt rund eine Stunde und wird nicht gespeichert – Mails und Anhänge laufen direkt von Google in deinen Tresor.</p>
          {GMAIL_CLIENT_ID ? (
            <button type="button" disabled={busy} onClick={() => void runGmail()} className="mt-4 inline-flex h-10 w-fit items-center gap-2 rounded-full bg-fg px-4 text-[14px] font-semibold text-canvas disabled:opacity-50">{busy ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />} {gmail ? "Jetzt abrufen" : "Gmail verbinden & abrufen"}</button>
          ) : (
            <p className="mt-4 rounded-xl border border-card-line bg-surface-2 px-3 py-2 text-[13px] text-soft">Gmail ist noch nicht eingerichtet: Es fehlt die Google Client-ID (<code>NEXT_PUBLIC_GOOGLE_CLIENT_ID</code>).</p>
          )}
        </section>

        {/* Proton / Dateien */}
        <section className={`${CARD} flex flex-col p-5`}>
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-surface-2"><Inbox size={20} /></span>
            <div className="min-w-0 flex-1">
              <h2 className="text-[18px] leading-[26px] font-semibold">Proton Mail & andere</h2>
              <p className="text-[13px] text-muted">Mail-Dateien (.eml, .mbox) importieren</p>
            </div>
          </div>
          <div
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); e.stopPropagation(); setDrag(false); void runFiles([...e.dataTransfer.files]); }}
            className={`mt-3 grid flex-1 place-items-center rounded-xl border-2 border-dashed px-4 py-5 text-center text-[13px] ${drag ? "border-brand-500 bg-brand-500/5" : "border-card-line"}`}>
            <span>
              <FileUp size={20} className="mx-auto mb-1.5 text-muted" />
              Mails hierher ziehen oder{" "}
              <button type="button" disabled={busy} onClick={() => fileRef.current?.click()} className="font-semibold text-selected underline">auswählen</button>
            </span>
          </div>
          <input ref={fileRef} type="file" multiple accept=".eml,.mbox,message/rfc822" className="hidden" onChange={(e) => { void runFiles([...(e.target.files ?? [])]); e.target.value = ""; }} />
          <details className="mt-3 text-[13px] text-soft">
            <summary className="cursor-pointer font-semibold text-fg">So bekommst du Mails aus Proton Mail</summary>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li><b>Einzelne Mail:</b> Mail öffnen → „…“ (Weitere) → „Exportieren“ → .eml-Datei hier ablegen.</li>
              <li><b>Ganzes Postfach (bezahlter Tarif):</b> Proton „Import-Export“-App → Postfach exportieren → die .eml-Dateien hier ablegen.</li>
              <li><b>Dauerhaft automatisch:</b> In Proton eine Weiterleitung (Filter „hat Anhang“) an dein Gmail einrichten – dann kommt alles über „Gmail abrufen“ mit.</li>
            </ul>
          </details>
        </section>
      </div>

      {(phase || error) && (
        <section className={`${CARD} mt-4 p-5`}>
          {phase && (
            <div className="flex items-center gap-3">
              {busy ? <Loader2 size={18} className="shrink-0 animate-spin text-brand-500" /> : <Check size={18} className="shrink-0 text-positive-text" />}
              <span className="flex-1 text-[14px] font-semibold">{phase.step}{phase.done !== undefined && phase.total !== undefined ? ` · ${phase.done} / ${phase.total}` : phase.done ? ` · ${phase.done}` : ""}</span>
            </div>
          )}
          {phase?.total ? <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${Math.round(((phase.done ?? 0) / phase.total) * 100)}%` }} /></div> : null}
          {error && <p role="alert" className="mt-3 rounded-xl bg-negative/10 px-3 py-2 text-[13px] text-negative-text">{error}</p>}
        </section>
      )}

      {rows.length > 0 && (
        <section className={`${CARD} mt-4 overflow-hidden`}>
          <h2 className="flex items-center gap-2 px-4 pt-5 pb-3 md:px-6 text-[18px] leading-[26px] font-semibold"><Sparkles size={17} className="text-brand-500" /> Relevant <span className="tnum rounded-full border border-card-line px-2 py-px text-[12px]">{relevant.length}</span></h2>
          <ul className="divide-y divide-line border-t border-line">
            {relevant.map((r) => <MailRow key={r.m.id} r={r} />)}
            {!relevant.length && <li className="px-5 py-4 text-[14px] text-muted">Nichts Relevantes gefunden.</li>}
          </ul>
          {skipped.length > 0 && (
            <>
              <button type="button" onClick={() => setShowSkipped(!showSkipped)} className="flex w-full items-center gap-2 border-t border-line px-5 py-3 text-left text-[13px] font-semibold text-soft hover:text-fg">
                <ChevronDown size={15} className={showSkipped ? "rotate-180" : ""} /> {skipped.length} übersprungen (Newsletter, Werbung …)
              </button>
              {showSkipped && <ul className="divide-y divide-line border-t border-line">{skipped.map((r) => <MailRow key={r.m.id} r={r} onImport={() => void importRow(r, r.m.attachments.map((_, i) => i), !r.m.attachments.length && !!r.m.bodyText)} />)}</ul>}
            </>
          )}
        </section>
      )}

      {!rows.length && recent.length > 0 && (
        <section className={`${CARD} mt-4 overflow-hidden`}>
          <h2 className="px-4 pt-5 pb-3 md:px-6 text-[18px] leading-[26px] font-semibold">Zuletzt aus Mails importiert</h2>
          <ul className="divide-y divide-line border-t border-line">
            {recent.map((s) => (
              <li key={s.msg_id} className="flex items-center gap-3 px-5 py-3">
                <Paperclip size={15} className="shrink-0 text-muted" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-semibold">{s.subject || "(ohne Betreff)"}</span>
                  <span className="block truncate text-[12px] text-muted">{senderName(s.sender ?? "")} · {s.mail_date ? fmtDate(s.mail_date) : ""} · {s.reason}</span>
                </span>
                <span className="shrink-0 text-[12px] text-muted">{s.doc_ids.length} {s.doc_ids.length === 1 ? "Datei" : "Dateien"}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function MailRow({ r, onImport }: { r: Row; onImport?: () => void }) {
  return (
    <li className="flex items-start gap-3 px-5 py-3">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface-2 text-[13px] font-semibold">{senderName(r.m.from).slice(0, 1).toUpperCase()}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-semibold">{r.m.subject || "(ohne Betreff)"}</span>
        <span className="block truncate text-[12px] text-muted">{senderName(r.m.from)}{r.m.date ? ` · ${fmtDate(r.m.date)}` : ""} · {r.reason}</span>
        <span className="mt-1 flex flex-wrap gap-1">
          {r.m.attachments.map((a, i) => <span key={i} className={`inline-flex max-w-[16rem] items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${r.relevant && r.pick.includes(i) ? "border-fg text-fg" : "border-card-line text-muted"}`}><Paperclip size={10} className="shrink-0" /><span className="truncate">{a.name}</span></span>)}
          {r.body && <span className="inline-flex items-center gap-1 rounded-full border border-fg px-2 py-0.5 text-[11px] font-medium text-fg"><Mail size={10} className="shrink-0" /> Mailtext als PDF</span>}
        </span>
      </span>
      <span className="shrink-0 pt-1">
        {r.state === "läuft" ? <Loader2 size={16} className="animate-spin text-muted" />
          : r.state === "importiert" ? <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-positive-text"><Check size={14} /> importiert</span>
          : r.state === "fehler" ? <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-negative-text"><X size={14} /> Fehler</span>
          : onImport ? <button type="button" onClick={onImport} className="rounded-full border border-card-line px-3 py-1 text-[12px] font-semibold hover:bg-surface-2">Trotzdem importieren</button>
          : null}
      </span>
    </li>
  );
}
