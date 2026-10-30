"use client";
import { DocLabels } from "@/components/Labels";
import { DocImportance } from "@/components/Importance";
import { DocAdvice } from "@/components/Advice";
import { openDraft } from "@/components/DraftSheet";
import { DRAFT_PURPOSES, suggestedPurposes } from "@/lib/drafts";
import Link from "next/link";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { VaultUnlock } from "@/components/VaultUnlock";
import { useMe } from "@/lib/me";
import { ArrowLeft, CalendarClock, Download, ExternalLink, Lock, Maximize2, PenLine, Quote, X } from "lucide-react";
import { CopyValue } from "@/components/CopyValue";
import { Clamp } from "@/components/Clamp";
import { caseIds } from "@/lib/dupes";
import { DocActions } from "@/components/DocActions";
import { PartnerFacts } from "@/components/PartnerInfo";
import { OfficePreview } from "@/components/OfficePreview";
import { relatedPayDocs } from "@/lib/related";
import { guessPurpose, PURPOSES, topicsFor } from "@/lib/topics";
import { isCardDoc, PdfPages } from "@/components/PdfPages";
import { officeKind } from "@/lib/office";
import { DocRow } from "@/components/DocRow";
import { SenderLogo } from "@/components/SenderLogo";
import { clusterOf } from "@/lib/clusters";
import { fmtDate, fmtMoney, isUrgent, useDocs } from "@/lib/docs";
import { buildPartners, partnerKey } from "@/lib/partners";
import { supabase } from "@/lib/supabase";
import type { Doc } from "@/lib/types";

/**
 * Detail von der Seite (wie bei Finastry): Klick auf ein Dokument oder einen Partner im Chat
 * öffnet rechts eine Vorschau – „Groß öffnen“ führt zur vollen Seite.
 */
/** page/quote: von einem Quellenverweis – Panel springt auf die Seite und markiert die Stelle */
export type Detail = { kind: "doc"; id: string; page?: number; quote?: string } | { kind: "partner"; key: string };
const Ctx = createContext<((d: Detail) => void) | undefined>(undefined);
/** Öffnet das Panel; außerhalb eines Hosts undefined (dann sind es normale Links) */
export const useDetail = () => useContext(Ctx);

export function DetailHost({ children }: { children: React.ReactNode }) {
  const [stack, setStack] = useState<Detail[]>([]);
  const open = (d: Detail) => setStack((s) => [...s.slice(-4), d]);
  const top = stack[stack.length - 1];
  useEffect(() => {
    if (!top) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setStack([]);
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [top]);
  return (
    <Ctx.Provider value={open}>
      {children}
      {top && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={() => setStack([])}>
          <aside role="dialog" aria-modal="true" className="panel-in pt-safe pb-safe flex h-full w-full max-w-[440px] flex-col bg-surface shadow-[-12px_0_40px_rgba(16,24,40,.18)]" onClick={(e) => e.stopPropagation()}>
            {/* kein eigener Kopfbalken: Schließen schwebt oben rechts, der Inhalt beginnt ganz oben */}
            <div className="relative flex-1 overflow-y-auto">
              <div className="sticky top-0 z-10 flex h-0 items-start justify-between gap-2 px-3 pt-3">
                {stack.length > 1 ? <button type="button" onClick={() => setStack((s) => s.slice(0, -1))} className="inline-flex h-9 items-center gap-1 rounded-full bg-surface-3 pr-3 pl-2 text-[14px] font-semibold hover:bg-line"><ArrowLeft size={16} /> Zurück</button> : <span />}
                <button type="button" onClick={() => setStack([])} aria-label="Schließen" className="grid h-9 w-9 place-items-center rounded-full bg-surface-3 hover:bg-line"><X size={17} /></button>
              </div>
              {top.kind === "doc" ? <DocDetail key={`${top.id}|${top.page ?? ""}|${top.quote ?? ""}`} id={top.id} page={top.page} quote={top.quote} open={open} close={() => setStack([])} back={stack.length > 1} /> : <PartnerDetail pkey={top.key} open={open} close={() => setStack([])} back={stack.length > 1} />}
            </div>
          </aside>
        </div>
      )}
    </Ctx.Provider>
  );
}

const BTN = "inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-full text-[14px] font-semibold";

function DocDetail({ id, page, quote, open, close, back = false }: { id: string; page?: number; quote?: string; open: (d: Detail) => void; close: () => void; back?: boolean }) {
  const { allDocs } = useDocs();
  const { unlocked } = useMe();
  const [doc, setDoc] = useState<Doc | undefined>(allDocs.find((d) => d.id === id));
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    void supabase.from("documents").select("*").eq("id", id).maybeSingle().then(({ data }) => data && setDoc(data as Doc));
  }, [id]);
  useEffect(() => {
    if (!doc || doc.encrypted || doc.file_path.startsWith("inbox/")) return;
    void supabase.storage.from("documents").createSignedUrl(doc.file_path, 600).then(({ data }) => setUrl(data?.signedUrl));
  }, [doc]);
  if (!doc) return <p className="p-6 text-[14px] text-muted">Dokument nicht gefunden.</p>;
  // gesperrt: weder Titel noch Absender oder Tags zeigen – nur Entsperren, mittig
  if (doc.encrypted && !unlocked) return <div className="grid min-h-[70dvh] place-items-center p-4 pt-14"><div className="w-full"><VaultUnlock /></div></div>;
  const c = clusterOf(doc.cluster);
  const image = doc.mime_type.startsWith("image/");
  // andere Schreiben zum selben Zahlungs-Vorgang
  const related = relatedPayDocs(doc, allDocs);
  const download = async () => {
    const { data } = await supabase.storage.from("documents").createSignedUrl(doc.file_path, 60, { download: doc.file_name });
    if (data) location.href = data.signedUrl;
  };
  return (
    <div className="space-y-4 p-4">
      <div className={`flex items-start gap-3 pr-11 ${back ? "pt-11" : ""}`}>
        <SenderLogo domain={doc.sender_domain} sender={doc.sender} cluster={doc.cluster} urgent={isUrgent(doc)} size={48} />
        <div className="min-w-0">
          <h2 className="text-[18px] leading-6 font-semibold">{doc.title ?? doc.file_name}</h2>
          <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[12px] text-muted">
            <span className="rounded-full border border-card-line px-2 py-px font-semibold text-fg">{c.label}</span>
            {fmtDate(doc.doc_date ?? doc.received_at)}
            {doc.sender && <> · <button type="button" onClick={() => open({ kind: "partner", key: partnerKey(doc.sender!) })} className="font-semibold text-selected hover:underline">{doc.sender}</button></>}
          </p>
        </div>
      </div>
      <Classify doc={doc} onChange={(d) => setDoc(d)} />
      <DocLabels doc={doc} onChange={(d) => setDoc(d)} />
      <DocImportance doc={doc} onChange={(d) => setDoc(d)} />
      <DocAdvice id={doc.id} />
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[12px] font-semibold text-muted">Schreiben</span>
        {suggestedPurposes(doc).slice(0, 4).map((p) => <button key={p} type="button" onClick={() => openDraft(doc, p)} className="inline-flex h-8 items-center gap-1 rounded-full border border-card-line px-3 text-[12.5px] font-semibold hover:bg-surface-2"><PenLine size={12} /> {DRAFT_PURPOSES.find((x) => x.id === p)!.label}</button>)}
      </div>
      {!doc.encrypted && <DocActions doc={doc} url={url} fullText={doc.full_text} related={related} />}
      <div className="flex gap-2">
        <Link href={`/d/${doc.id}`} onClick={close} className={`${BTN} bg-brand-500 text-white hover:bg-brand-600`}><Maximize2 size={15} /> Groß öffnen</Link>
        {!doc.encrypted && !doc.file_path.startsWith("inbox/") && <button type="button" onClick={() => void download()} className={`${BTN} border border-card-line hover:bg-surface-2`}><Download size={15} /> Original</button>}
      </div>
      {doc.encrypted ? (
        <p className="flex items-center gap-2 rounded-xl border border-card-line p-3 text-[13px] text-soft"><Lock size={15} /> Verschlüsselt – Inhalt siehst du in der großen Ansicht nach dem Entsperren.</p>
      ) : (
        <>
          {(quote || page) && (
            <figure className="rounded-xl border-l-[3px] border-brand-500 bg-brand-500/[.06] px-3 py-2.5">
              <figcaption className="flex items-center gap-1.5 text-[11.5px] font-semibold tracking-wide text-brand-600 uppercase"><Quote size={12} /> Fundstelle{page ? ` · Seite ${page}` : ""}</figcaption>
              {quote && <blockquote className="mt-1 text-[13.5px] leading-5">„{quote}“</blockquote>}
            </figure>
          )}
          {doc.summary && !(quote || page) && <Clamp lines={3} className="text-[14px] leading-6 text-soft">{doc.summary}</Clamp>}
          {url && (
            <div className="overflow-hidden rounded-xl bg-surface-2">
              {image ? <a href={`/d/${doc.id}`} onClick={close} className="block bg-surface-2 p-3"><img src={url} alt={doc.title ?? ""} className="mx-auto block h-64 w-full object-contain sm:h-72" /></a> : officeKind(doc.mime_type, doc.file_name) ? <OfficePreview url={url} mime={doc.mime_type} name={doc.file_name} compact /> : doc.mime_type === "application/pdf" ? <PdfPages url={url} card={isCardDoc(doc)} compact bare focus={quote || page ? { page, quote } : undefined} /> : <iframe src={`${url}#toolbar=0&view=FitH`} title="Vorschau" className="h-80 w-full" />}
            </div>
          )}
          {doc.deadlines?.length > 0 && (
            <div className="rounded-xl border border-card-line">
              <p className="flex items-center gap-1.5 px-3 pt-2.5 text-[13px] font-semibold"><CalendarClock size={14} /> Fristen</p>
              <ul className="divide-y divide-line text-[13px]">{doc.deadlines.map((x, i) => <li key={i} className="flex gap-3 px-3 py-2"><b className="tnum w-20 shrink-0">{fmtDate(x.date)}</b>{x.what}</li>)}</ul>
            </div>
          )}
          {doc.key_facts?.length > 0 && (
            <dl className="divide-y divide-line rounded-xl border border-card-line text-[13px]">
              {doc.key_facts.slice(0, 10).map((f, i) => <div key={i} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-2 px-3 py-2"><dt className="min-w-0 break-words text-muted">{f.label}</dt><dd className="min-w-0 font-semibold break-words">{f.value}</dd></div>)}
            </dl>
          )}
          {doc.amounts?.[0] && <p className="text-[13px] text-muted">{doc.amounts[0].label}: <b className="text-fg">{fmtMoney(doc.amounts[0].value, doc.amounts[0].currency)}</b></p>}
        </>
      )}
    </div>
  );
}

function PartnerDetail({ pkey, open, close, back = false }: { pkey: string; open: (d: Detail) => void; close: () => void; back?: boolean }) {
  const { allDocs } = useDocs();
  const p = useMemo(() => buildPartners(allDocs).find((x) => x.key === pkey), [allDocs, pkey]);
  if (!p) return <p className="p-6 text-[14px] text-muted">Partner nicht gefunden.</p>;
  const today = new Date().toISOString().slice(0, 10);
  const deadlines = p.docs.flatMap((d) => (d.deadlines ?? []).filter((x) => x.date >= today).map((x) => ({ ...x, d }))).sort((a, b) => a.date.localeCompare(b.date));
  return (
    <div className="space-y-4 p-4">
      <div className={`flex items-center gap-3 pr-11 ${back ? "pt-11" : ""}`}>
        <SenderLogo domain={p.domain} sender={p.name} cluster={p.cluster} size={52} />
        <div className="min-w-0">
          <h2 className="text-[18px] leading-6 font-semibold">{p.name}</h2>
          <p className="text-[12px] text-muted">{clusterOf(p.cluster).label} · {p.docs.length} {p.docs.length === 1 ? "Dokument" : "Dokumente"}{p.isShop ? ` · zuletzt ${fmtDate(p.last)}` : ""}</p>
        </div>
      </div>
      <div className="flex gap-2">
        <Link href={`/partner/${p.key}`} onClick={close} className={`${BTN} bg-brand-500 text-white hover:bg-brand-600`}><Maximize2 size={15} /> Groß öffnen</Link>
        {p.domain && <a href={`https://${p.domain}`} target="_blank" rel="noopener noreferrer" className={`${BTN} border border-card-line hover:bg-surface-2`}><ExternalLink size={15} /> Website</a>}
      </div>
      <PartnerFacts p={p} />
      {p.ids.length > 6 && (
        <div className="rounded-xl border border-card-line">
          <p className="px-3 pt-2.5 text-[13px] font-semibold">Alle Kennungen & Nummern</p>
          <ul className="divide-y divide-line text-[13px]">{p.ids.slice(0, 10).map((i, n) => <li key={n} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-2 px-3 py-2"><span className="min-w-0 break-words text-muted">{i.label}</span><CopyValue value={i.value} /></li>)}</ul>
        </div>
      )}
      {deadlines.length > 0 && (
        <div className="rounded-xl border border-card-line">
          <p className="flex items-center gap-1.5 px-3 pt-2.5 text-[13px] font-semibold"><CalendarClock size={14} /> Anstehend</p>
          <ul className="divide-y divide-line text-[13px]">{deadlines.map((x, i) => <li key={i} className="flex gap-3 px-3 py-2"><b className="tnum w-20 shrink-0">{fmtDate(x.date)}</b>{x.what}</li>)}</ul>
        </div>
      )}
      <div className="overflow-hidden rounded-xl border border-card-line">
        <p className="px-3 pt-2.5 text-[13px] font-semibold">Dokumente</p>
        <div className="divide-y divide-line">{p.docs.map((d) => <div key={d.id} onClickCapture={(e) => { e.preventDefault(); e.stopPropagation(); open({ kind: "doc", id: d.id }); }}><DocRow d={d} /></div>)}</div>
      </div>
    </div>
  );
}

/** Einordnung von Hand korrigieren: Thema und Zweck – bleibt beim erneuten Auslesen erhalten */
function Classify({ doc, onChange }: { doc: Doc; onChange: (d: Doc) => void }) {
  const { refresh } = useDocs();
  const save = async (patch: Partial<Doc>) => {
    const next = { ...doc, ...patch, topic_manual: true };
    onChange(next);
    await supabase.from("documents").update({ ...patch, topic_manual: true }).eq("id", doc.id);
    void refresh();
  };
  const sel = "h-8 min-w-0 rounded-full border border-card-line bg-surface px-2.5 text-[12.5px] font-semibold";
  return (
    <div className="flex flex-wrap items-center gap-2 text-[12px] text-muted">
      <span>Einordnung</span>
      <select aria-label="Thema" value={doc.topic ?? ""} onChange={(e) => void save({ topic: e.target.value })} className={`${sel} max-w-[12rem]`}>
        {!doc.topic && <option value="">Thema wählen</option>}
        {topicsFor(doc.cluster).map((t) => <option key={t} value={t}>{t}</option>)}
      </select>
      <select aria-label="Zweck" value={doc.purpose ?? guessPurpose(doc)} onChange={(e) => void save({ purpose: e.target.value as Doc["purpose"] })} className={sel}>
        {PURPOSES.filter((p) => p.id !== "erledigt").map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
      </select>
    </div>
  );
}
