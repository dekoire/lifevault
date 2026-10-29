"use client";
import { useState } from "react";
import { AtSign, Check, Copy, Loader2, Plus, RefreshCw, RotateCcw, ShieldCheck, X } from "lucide-react";
import { CARD, Switch } from "@/components/ui";
import { useDocs } from "@/lib/docs";
import { importInbox, inboxAddress, MAIL_MODES, useInbox, type InboxResult } from "@/lib/inbox";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Einstellungen › E-Mail-Import: eigene Adresse, erlaubte Absender, automatisch oder von Hand abrufen */
export function InboxCard({ mode, from, to }: { mode: "since" | "range"; from: string; to: string }) {
  const { inbox, create, save, renew } = useInbox();
  const { upload } = useDocs();
  const [copied, setCopied] = useState(false);
  const [add, setAdd] = useState("");
  const [step, setStep] = useState<string>();
  const [result, setResult] = useState<InboxResult>();
  const [error, setError] = useState<string>();
  const [confirmRenew, setConfirmRenew] = useState(false);

  if (inbox === undefined) return <section className={`${CARD} p-5 lg:col-span-2`}><Loader2 size={18} className="animate-spin text-muted" /></section>;
  if (inbox === null) return (
    <section className={`${CARD} flex flex-wrap items-center gap-4 p-5 lg:col-span-2`}>
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand-500 text-white"><AtSign size={20} /></span>
      <span className="min-w-0 flex-1"><b className="block text-[16px]">Eigene Lifevault-Adresse</b><span className="text-[13px] text-soft">Rechnungen & Briefe einfach weiterleiten – die Anhänge landen automatisch in deinem Tresor.</span></span>
      <button type="button" onClick={() => void create()} className="inline-flex h-10 items-center gap-2 rounded-full bg-fg px-4 text-[14px] font-semibold text-canvas"><Plus size={16} /> Adresse erzeugen</button>
    </section>
  );

  const address = inboxAddress(inbox.token);
  const addSender = () => {
    const v = add.trim().toLowerCase();
    if (!EMAIL.test(v) || inbox.allowed.includes(v)) return;
    void save({ allowed: [...inbox.allowed, v] });
    setAdd("");
  };
  const run = async () => {
    setError(undefined); setResult(undefined);
    const last = inbox.last_sync_at ? new Date(inbox.last_sync_at) : null;
    const range = mode === "range"
      ? { since: new Date(`${from}T00:00:00`), until: new Date(new Date(`${to}T00:00:00`).getTime() + 86_400_000), advance: false }
      : { since: last ? new Date(last.getTime() - 3_600_000) : new Date(Date.now() - 30 * 86_400_000) };
    try { setResult(await importInbox({ ...range, upload, mode: inbox?.mode, onStep: (s, d, t) => setStep(t ? `${s} · ${d} / ${t}` : s) })); }
    catch (e) { setError((e as Error).message); }
    finally { setStep(undefined); }
  };

  return (
    <section className={`${CARD} overflow-hidden lg:col-span-2`}>
      <div className="flex flex-wrap items-center gap-3 p-5">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand-500 text-white"><AtSign size={20} /></span>
        <span className="min-w-0 flex-1">
          <b className="block text-[16px]">Deine Lifevault-Adresse</b>
          <span className="text-[12.5px] text-muted">Mails mit Anhang hierhin weiterleiten oder schicken lassen</span>
        </span>
      </div>
      <div className="mx-5 flex items-center gap-2 rounded-2xl bg-surface-2 py-2 pr-2 pl-4">
        <code className="min-w-0 flex-1 truncate text-[15px] font-semibold">{address}</code>
        <button type="button" onClick={() => { void navigator.clipboard.writeText(address); setCopied(true); setTimeout(() => setCopied(false), 1400); }} className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-fg px-3.5 text-[13px] font-semibold text-canvas">{copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Kopiert" : "Kopieren"}</button>
      </div>
      <p className="mx-5 mt-2 text-[12px] text-muted">
        Die Adresse ist geheim wie ein Schlüssel. Wurde sie bekannt?{" "}
        {confirmRenew
          ? <><button type="button" onClick={() => { void renew(); setConfirmRenew(false); }} className="font-semibold text-negative-text">Ja, neue Adresse – die alte nimmt nichts mehr an</button> · <button type="button" onClick={() => setConfirmRenew(false)} className="font-semibold">Abbrechen</button></>
          : <button type="button" onClick={() => setConfirmRenew(true)} className="inline-flex items-center gap-1 font-semibold text-fg"><RotateCcw size={11} /> Neue Adresse erzeugen</button>}
      </p>

      <div className="mt-4 border-t border-line p-5">
        <b className="flex items-center gap-1.5 text-[14px]"><ShieldCheck size={15} /> Erlaubte Absender</b>
        <span className="block text-[12.5px] text-muted">Nur Mails von diesen Adressen werden übernommen – und nur, wenn der Absender echt ist (SPF/DKIM). Leitest du aus deinem Postfach weiter, trag dessen Adresse ein.</span>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {inbox.allowed.map((a) => (
            <span key={a} className="inline-flex h-8 items-center gap-1 rounded-full border border-card-line pr-1 pl-3 text-[13px] font-semibold">
              {a}
              <button type="button" aria-label={`${a} entfernen`} onClick={() => void save({ allowed: inbox.allowed.filter((x) => x !== a) })} className="grid h-6 w-6 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-fg"><X size={13} /></button>
            </span>
          ))}
          {!inbox.allowed.length && <span className="text-[13px] text-negative-text">Noch keine – so wird nichts übernommen.</span>}
        </div>
        <form onSubmit={(e) => { e.preventDefault(); addSender(); }} className="mt-2.5 flex max-w-md gap-2">
          <input type="email" value={add} onChange={(e) => setAdd(e.target.value)} placeholder="name@beispiel.de" aria-label="Absender hinzufügen" className="h-10 min-w-0 flex-1 rounded-full border border-card-line bg-surface px-4 text-[14px] outline-none focus:border-fg" />
          <button type="submit" disabled={!EMAIL.test(add.trim())} className="inline-flex h-10 items-center gap-1.5 rounded-full border border-card-line px-4 text-[13px] font-semibold disabled:opacity-40"><Plus size={14} /> Hinzufügen</button>
        </form>
      </div>

      {inbox.mode && (
        <div className="border-t border-line p-5">
          <b className="block text-[14px]">Was soll gelesen werden?</b>
          <div className="mt-2.5 inline-flex flex-wrap gap-1 rounded-full bg-surface-2 p-1">
            {MAIL_MODES.map((m) => <button key={m.id} type="button" onClick={() => void save({ mode: m.id })} aria-pressed={inbox.mode === m.id} className={`h-9 rounded-full px-3.5 text-[13px] font-semibold ${inbox.mode === m.id ? "bg-surface text-fg shadow-sm" : "text-soft hover:text-fg"}`}>{m.label}</button>)}
          </div>
          <p className="mt-2 text-[12.5px] text-muted">{MAIL_MODES.find((m) => m.id === inbox.mode)?.hint} Die KI entscheidet, was relevant ist; Werbung und Versandinfos ohne Preis werden nicht abgelegt.</p>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-4 border-t border-line p-5">
        <span className="min-w-0 flex-1">
          <b className="block text-[14px]">Automatisch abrufen</b>
          <span className="text-[12.5px] text-muted">Alle 15 Minuten auf dem Server, auch wenn die App zu ist – nur, was seit dem letzten Abruf neu ist. Zuletzt: {inbox.last_sync_at ? new Date(inbox.last_sync_at).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" }) : "noch nie"}</span>
        </span>
        <Switch on={inbox.auto_sync} onChange={(v) => void save({ auto_sync: v })} label="Automatisch abrufen" />
      </div>
      <div className="flex flex-wrap items-center gap-3 border-t border-line p-5">
        <button type="button" disabled={!!step} onClick={() => void run()} className="inline-flex h-10 items-center gap-2 rounded-full bg-fg px-4 text-[14px] font-semibold text-canvas disabled:opacity-50">{step ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />} {mode === "range" ? "Zeitraum jetzt importieren" : "Jetzt abrufen"}</button>
        <span className="text-[12.5px] text-muted">{step ?? (mode === "range" ? `Komplett-Import ${from} bis ${to} (Zeitraum oben)` : "Seit letztem Abruf (Zeitraum oben umstellbar)")}</span>
      </div>
      {(result || error) && (
        <div className="border-t border-line px-5 py-4 text-[13px]">
          {error && <p role="alert" className="rounded-xl bg-negative/10 px-3 py-2 text-negative-text">{error}</p>}
          {result && (
            <>
              <p className="font-semibold">{result.imported ? `${result.files} ${result.files === 1 ? "Dokument" : "Dokumente"} aus ${result.imported} ${result.imported === 1 ? "Mail" : "Mails"} übernommen.` : "Nichts Neues."}{result.known ? ` ${result.known} schon bekannt.` : ""}{result.withoutDocs ? ` ${result.withoutDocs} ohne Dokument.` : ""}</p>
              {result.rejected.length > 0 && (
                <ul className="mt-2 space-y-1 text-[12.5px] text-muted">
                  {result.rejected.slice(0, 5).map((r, i) => <li key={i}>Ignoriert: „{r.subject || "ohne Betreff"}“ – {r.reason}</li>)}
                </ul>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
