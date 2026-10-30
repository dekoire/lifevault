"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ChevronDown, CircleCheck, Copy, FileText, Files, Info, Receipt, Star } from "lucide-react";
import { ImportanceDots } from "@/components/Importance";
import { KindTag } from "@/components/KindTag";
import { Thumb } from "@/components/ChatWidgets";
import { CARD } from "@/components/ui";
import { fmtDate } from "@/lib/docs";
import { findDuplicates } from "@/lib/dupes";
import { importanceOf, roleLabel } from "@/lib/importance";
import type { Doc } from "@/lib/types";

type Bucket = "wichtig" | "laufend" | "info" | "erledigt" | "doppelt";
const BUCKETS: { id: Bucket; title: string; hint: string; icon: React.ReactNode; open: boolean }[] = [
  { id: "wichtig", title: "Das Wichtige", hint: "Hier steht, was gilt – das schaust du nach, wenn etwas ist.", icon: <Star size={16} />, open: true },
  { id: "laufend", title: "Laufend", hint: "Rechnungen, Abrechnungen und Schreiben aus dem laufenden Vertrag.", icon: <Receipt size={16} />, open: true },
  { id: "info", title: "Zur Info", hint: "Bedingungen, Infoblätter, Werbung – gut zu haben, selten gebraucht.", icon: <Info size={16} />, open: false },
  { id: "erledigt", title: "Erledigt & veraltet", hint: "Bezahlt, überholt oder gekündigt – bleibt zum Nachweis im Archiv.", icon: <CircleCheck size={16} className="text-positive-text" />, open: false },
  { id: "doppelt", title: "Doppelt", hint: "Gleicher Inhalt wie ein anderes Dokument – kann weg.", icon: <Copy size={16} />, open: false },
];
const dateOf = (d: Doc) => d.doc_date ?? d.received_at.slice(0, 10);

/** Einordnung eines Dokuments beim Partner – mit Grund in einem Satz */
function sortDocs(docs: Doc[]) {
  const out = new Map<string, { bucket: Bucket; why: string }>();
  // doppelt: alle außer dem, das man behalten sollte
  for (const g of findDuplicates(docs)) for (const d of g.docs.slice(1)) out.set(d.id, { bucket: "doppelt", why: `wie „${g.docs[0].title ?? g.docs[0].file_name}“${g.why ? ` – ${g.why}` : ""}` });
  // neueste Änderung je Grundlage gilt, ältere sind überholt
  const newestChange = new Map<string, string>();
  for (const d of docs) if (d.partner_role === "aenderung" && !d.archived) { const k = d.basis_id ?? ""; if (dateOf(d) > (newestChange.get(k) ?? "")) newestChange.set(k, dateOf(d)); }
  for (const d of docs) {
    if (out.has(d.id)) continue;
    const imp = importanceOf(d);
    if (d.archived) out.set(d.id, { bucket: "erledigt", why: d.archived_reason ?? "archiviert" });
    else if (d.partner_role === "grundlage") out.set(d.id, { bucket: "wichtig", why: `Grundlage – ${d.importance_reason ?? "hier steht, was gilt"}` });
    else if (d.partner_role === "aenderung" && newestChange.get(d.basis_id ?? "") === dateOf(d)) out.set(d.id, { bucket: "wichtig", why: `aktuell gültige Änderung${d.importance_reason ? ` – ${d.importance_reason}` : ""}` });
    else if (d.partner_role === "nebensache" || imp <= 1) out.set(d.id, { bucket: "info", why: d.importance_reason ?? "nur zur Information" });
    else if (imp >= 4 && d.partner_role !== "laufend") out.set(d.id, { bucket: "wichtig", why: d.importance_reason ?? "sehr wichtig" });
    else out.set(d.id, { bucket: "laufend", why: [roleLabel(d.partner_role), d.importance_reason].filter(Boolean).join(" – ") || "laufender Vorgang" });
  }
  return out;
}

/**
 * Dokumente eines Partners nach Relevanz statt nur nach Datum: das Hauptdokument oben, darunter das Wichtige,
 * Laufendes, Infos, Erledigtes und Doppeltes – jeweils mit einem Satz, warum es dort steht.
 */
/** afterMain: direkt unter dem Hauptdokument (Anstehendes – Fristen, Kündigung) */
export function PartnerRelevance({ docs, afterMain }: { docs: Doc[]; afterMain?: React.ReactNode }) {
  const sorted = useMemo(() => sortDocs(docs), [docs]);
  const [open, setOpen] = useState<Record<Bucket, boolean>>(Object.fromEntries(BUCKETS.map((b) => [b.id, b.open])) as Record<Bucket, boolean>);
  const of = (b: Bucket) => docs.filter((d) => sorted.get(d.id)?.bucket === b).sort((a, b2) => importanceOf(b2) - importanceOf(a) || dateOf(b2).localeCompare(dateOf(a)));
  // Hauptdokument: wichtigste gültige Grundlage (sonst das Wichtigste überhaupt)
  const main = of("wichtig").find((d) => d.partner_role === "grundlage") ?? of("wichtig")[0];
  const [all, setAll] = useState(false);
  const byDate = [...docs].sort((a, b) => dateOf(b).localeCompare(dateOf(a)));
  const today = new Date().toISOString().slice(0, 10);
  const due = docs.filter((d) => !d.archived && (d.deadlines ?? []).some((x) => x.date >= today)).length;
  const count = (b: Bucket) => docs.filter((d) => sorted.get(d.id)?.bucket === b).length;
  const first = byDate[byDate.length - 1], last = byDate[0];
  return (
    <div className="space-y-3">
      {main && (
        <Link href={`/d/${main.id}`} className="block rounded-2xl bg-brand-500 p-4 text-white shadow-card transition hover:brightness-105">
          <span className="flex items-center gap-1.5 text-[12px] font-semibold tracking-wide text-white/80 uppercase"><FileText size={14} /> Hauptdokument</span>
          <b className="mt-1 block text-[17px] leading-6">{main.title ?? main.file_name}</b>
          <span className="mt-0.5 block text-[13px] text-white/85">{main.doc_type ?? ""}{main.doc_type ? " · " : ""}{fmtDate(dateOf(main))} · das schaust du nach, wenn etwas ist</span>
        </Link>
      )}
      {afterMain}
      {/* Überblick: was es hier gibt, auf einen Blick – darunter alle Dokumente kompakt */}
      <section className={`${CARD} overflow-hidden`}>
        <div className="px-4 pt-3.5 pb-3">
          <span className="flex items-center gap-2 text-[15px] font-semibold"><Files size={16} className="text-muted" /> Überblick</span>
          <p className="mt-1 text-[13px] leading-5 text-soft">{docs.length} {docs.length === 1 ? "Dokument" : "Dokumente"}{first ? ` von ${fmtDate(dateOf(first))} bis ${fmtDate(dateOf(last))}` : ""}{last ? <>, zuletzt <b className="font-semibold text-fg">{last.title ?? last.file_name}</b></> : null}.</p>
        </div>
        <div className="grid grid-cols-4 divide-x divide-line border-t border-line text-center">
          {([["Wichtig", count("wichtig"), ""], ["Laufend", count("laufend"), ""], ["Offen", due, due ? "text-negative-text" : ""], ["Erledigt", count("erledigt"), "text-positive-text"]] as const).map(([l, n, c]) => (
            <div key={l} className="px-2 py-2.5"><b className={`tnum block text-[18px] leading-6 ${n ? c : "text-muted"}`}>{n}</b><span className="text-[11.5px] text-muted">{l}</span></div>
          ))}
        </div>
        <ul className="divide-y divide-line border-t border-line">
          {(all ? byDate : byDate.slice(0, 6)).map((d) => {
            const b = sorted.get(d.id)?.bucket;
            const gone = b === "erledigt" || b === "doppelt";
            return (
              <li key={d.id}>
                {/* wie die übrigen Dokumentzeilen: Vorschau des Blatts, Titel, Art und Datum, darunter worum es geht */}
                <Link href={`/d/${d.id}`} className={`flex items-start gap-3 px-4 py-3 hover:bg-surface-2/70 ${gone ? "opacity-70" : ""}`}>
                  <span className="relative h-[52px] w-10 shrink-0 overflow-hidden rounded-md border border-card-line bg-surface-2">
                    <Thumb d={d} />
                    {gone && <span className="absolute -right-1 -bottom-1 grid h-5 w-5 place-items-center rounded-full bg-surface text-positive-text"><CircleCheck size={15} /></span>}
                  </span>
                  <span className="min-w-0 flex-1">
                    <b className="block truncate text-[14.5px] leading-5 font-semibold">{d.title ?? d.file_name}</b>
                    <span className="mt-0.5 flex min-w-0 items-center gap-2 text-[12.5px] text-muted"><KindTag d={d} /><span className="tnum truncate">{d.doc_date ? fmtDate(d.doc_date) : "ohne Datum"}</span></span>
                    {d.summary && <span className="mt-0.5 line-clamp-1 block text-[12.5px] leading-[18px] text-soft">{d.summary}</span>}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
        {byDate.length > 6 && <button type="button" onClick={() => setAll(!all)} className="w-full border-t border-line py-2.5 text-[13px] font-semibold text-selected hover:bg-surface-2/60">{all ? "Weniger anzeigen" : `Alle ${byDate.length} anzeigen`}</button>}
      </section>
      {BUCKETS.map((b) => {
        const list = of(b.id).filter((d) => d.id !== main?.id);
        if (!list.length) return null;
        return (
          <section key={b.id} className={`${CARD} overflow-hidden`}>
            <button type="button" onClick={() => setOpen({ ...open, [b.id]: !open[b.id] })} aria-expanded={open[b.id]} className="flex w-full items-start gap-3 px-4 py-3.5 text-left hover:bg-surface-2/60">
              <span className="mt-0.5 text-muted">{b.icon}</span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 text-[15px] font-semibold">{b.title}<span className="tnum rounded-full border border-card-line px-2 py-px text-[11.5px] text-soft">{list.length}</span></span>
                <span className="block text-[12.5px] text-muted">{b.hint}</span>
              </span>
              <ChevronDown size={16} className={`mt-1 shrink-0 text-muted transition-transform ${open[b.id] ? "rotate-180" : ""}`} />
            </button>
            {open[b.id] && (
              <ul className="divide-y divide-line border-t border-line">
                {list.map((d) => (
                  <li key={d.id}>
                    <Link href={`/d/${d.id}`} className={`flex items-start gap-3 px-4 py-3 hover:bg-surface-2/70 ${b.id === "erledigt" || b.id === "doppelt" ? "opacity-75" : ""}`}>
                      {b.id === "erledigt" && <CircleCheck size={16} className="mt-0.5 shrink-0 text-positive-text" />}
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5"><KindTag d={d} /><span className="truncate text-[14px] font-semibold">{d.title ?? d.file_name}</span></span>
                        <span className="mt-0.5 block text-[12.5px] leading-5 text-soft">{sorted.get(d.id)?.why}</span>
                        <span className="block text-[11.5px] text-muted">{fmtDate(dateOf(d))}</span>
                      </span>
                      {d.importance != null && <span className="mt-1.5"><ImportanceDots value={d.importance} /></span>}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
