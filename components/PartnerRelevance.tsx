"use client";
import { IconTile, tintGradient } from "@/components/ClusterIcon";
import Link from "next/link";
import { useMemo, useState } from "react";
import { BookOpen, ChevronDown, ChevronRight, CircleCheck, Copy, Crown, FileText, Files, RefreshCw, type LucideIcon } from "lucide-react";
import { ImportanceDots } from "@/components/Importance";
import { KindTag } from "@/components/KindTag";
import { Thumb } from "@/components/ChatWidgets";
import { CARD } from "@/components/ui";
import { fmtDate, knownDate, knownDateLabel, useDocs } from "@/lib/docs";
import { findDuplicates } from "@/lib/dupes";
import { importanceOf, roleLabel } from "@/lib/importance";
import type { Doc } from "@/lib/types";

type Bucket = "wichtig" | "laufend" | "info" | "erledigt" | "doppelt";
// Symbole gut sichtbar: weiß auf einer vollen Farbfläche, je Gruppe eine eigene Farbe
const BUCKETS: { id: Bucket; title: string; hint: string; icon: LucideIcon; color: string; open: boolean }[] = [
  { id: "wichtig", title: "Das Wichtige", hint: "Hier steht, was gilt – das schaust du nach, wenn etwas ist.", icon: Crown, color: "#6d4aff", open: true },
  { id: "laufend", title: "Laufend", hint: "Rechnungen, Abrechnungen und Schreiben aus dem laufenden Vertrag.", icon: RefreshCw, color: "#2563eb", open: true },
  { id: "info", title: "Zur Info", hint: "Bedingungen, Infoblätter, Werbung – gut zu haben, selten gebraucht.", icon: BookOpen, color: "#64748b", open: false },
  { id: "erledigt", title: "Erledigt & veraltet", hint: "Bezahlt, überholt oder gekündigt – bleibt zum Nachweis im Archiv.", icon: CircleCheck, color: "#16a34a", open: false },
  { id: "doppelt", title: "Doppelt", hint: "Gleicher Inhalt wie ein anderes Dokument – kann weg.", icon: Copy, color: "#d97706", open: false },
];
const Badge = ({ icon, color }: { icon: LucideIcon; color: string }) => <IconTile icon={icon} color={color} size={40} />;
const dateOf = (d: Doc) => d.doc_date ?? d.received_at.slice(0, 10);
/** Datum mit Herkunft (nie „ohne Datum“) – Teile einer Mappe bekommen deren Datum */
const shown = (d: Doc, all: Doc[]) => knownDateLabel(knownDate(d, all));

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
  const { allDocs } = useDocs();
  const [open, setOpen] = useState<Record<Bucket, boolean>>(Object.fromEntries(BUCKETS.map((b) => [b.id, b.open])) as Record<Bucket, boolean>);
  const of = (b: Bucket) => docs.filter((d) => sorted.get(d.id)?.bucket === b).sort((a, b2) => importanceOf(b2) - importanceOf(a) || dateOf(b2).localeCompare(dateOf(a)));
  // Hauptdokument: wichtigste gültige Grundlage (sonst das Wichtigste überhaupt)
  const main = of("wichtig").find((d) => d.partner_role === "grundlage") ?? of("wichtig")[0];
  const [all, setAll] = useState(false);
  const iso = (d: Doc) => knownDate(d, allDocs).iso;
  const byDate = [...docs].sort((a, b) => iso(b).localeCompare(iso(a)));
  const today = new Date().toISOString().slice(0, 10);
  const due = docs.filter((d) => !d.archived && (d.deadlines ?? []).some((x) => x.date >= today)).length;
  const count = (b: Bucket) => docs.filter((d) => sorted.get(d.id)?.bucket === b).length;
  const first = byDate[byDate.length - 1], last = byDate[0];
  // Dokumentzeilen wie die Tabelle „Letzte Buchungen“ in Finastry: Kopfzeile, gleicher Rand, höchstens zwei Zeilen Text
  const GRID = "md:grid md:grid-cols-[minmax(0,1fr)_8.5rem_6.5rem_3.5rem_1rem] md:items-center md:gap-4";
  const HEAD = "text-[12px] font-semibold text-muted";
  const Head = () => (
    <div className={`hidden border-b border-line px-6 py-[18px] ${GRID}`} role="row">
      <span className={HEAD}>Dokument</span><span className={HEAD}>Art</span><span className={HEAD}>Datum</span><span className={HEAD}>Wichtig</span><span />
    </div>
  );
  const Row = ({ d, note, dim }: { d: Doc; note?: string | null; dim?: boolean }) => (
    <Link href={`/d/${d.id}`} className={`flex items-center gap-3 px-4 py-[18px] hover:bg-canvas md:px-6 ${GRID} ${dim ? "opacity-70" : ""}`}>
      <span className="flex min-w-0 flex-1 items-center gap-3">
        <span className="relative h-11 w-9 shrink-0 overflow-hidden rounded-md border border-card-line bg-surface-2"><Thumb d={d} /></span>
        <span className="min-w-0">
          <b className="block truncate text-[14px] leading-5 font-semibold">{d.title ?? d.file_name}</b>
          <span className="block truncate text-[12px] leading-[18px] text-muted"><span className="md:hidden">{shown(d, allDocs)}{note ? " · " : ""}</span>{note}</span>
        </span>
      </span>
      <span className="hidden min-w-0 text-[13px] md:block"><KindTag d={d} /></span>
      <span className="tnum hidden truncate text-[13px] text-soft md:block">{shown(d, allDocs)}</span>
      <span className="hidden md:block">{d.importance != null && <ImportanceDots value={d.importance} />}</span>
      <ChevronRight size={16} className="hidden shrink-0 text-muted md:block" />
    </Link>
  );
  const years = first ? [iso(first).slice(0, 4), iso(last).slice(0, 4)].filter((y, i, a) => a.indexOf(y) === i).join("–") : "";
  return (
    <div className="space-y-4">
      {main && (
        <Link href={`/d/${main.id}`} className="block rounded-2xl bg-brand-500 px-6 py-5 text-white shadow-card transition hover:brightness-105">
          <span className="flex items-center gap-1.5 text-[13px] font-medium text-white/80"><FileText size={14} /> Hauptdokument</span>
          <b className="mt-1 line-clamp-2 block text-[18px] leading-[26px]">{main.title ?? main.file_name}</b>
          <span className="mt-0.5 block truncate text-[13px] text-white/85">{main.doc_type ?? ""}{main.doc_type ? " · " : ""}{fmtDate(dateOf(main))}</span>
        </Link>
      )}
      {afterMain}
      {/* Überblick: Zahlen auf einen Blick, darunter die neuesten Dokumente */}
      <section className={`${CARD} overflow-hidden`}>
        <div className="flex items-center gap-3 px-4 pt-5 pb-4 md:px-6">
          <Badge icon={Files} color="#6d4aff" />
          <span className="min-w-0">
            <h2 className="text-[18px] leading-[26px] font-semibold">Überblick</h2>
            <p className="truncate text-[13px] text-muted">{docs.length} {docs.length === 1 ? "Dokument" : "Dokumente"}{years ? ` · ${years}` : ""}</p>
          </span>
        </div>
        {/* Zahlen als leicht farbige Kacheln */}
        <div className="grid grid-cols-2 gap-2.5 px-4 pb-5 sm:grid-cols-4 md:px-6">
          {([["Wichtig", count("wichtig"), "#6d4aff"], ["Laufend", count("laufend"), "#2563eb"], ["Offen", due, "#b42318"], ["Erledigt", count("erledigt"), "#16a34a"]] as const).map(([l, n, c]) => (
            <div key={l} className="rounded-xl px-4 py-3.5" style={{ background: tintGradient(n ? c : "#94a3b8") }}>
              <b className="tnum block text-[22px] leading-7" style={{ color: n ? c : "var(--color-muted)" }}>{n}</b>
              <span className="text-[13px] font-medium text-soft">{l}</span>
            </div>
          ))}
        </div>
        <Head />
        <div className="divide-y divide-line">
          {(all ? byDate : byDate.slice(0, 5)).map((d) => {
            const b = sorted.get(d.id)?.bucket;
            return <Row key={d.id} d={d} note={d.doc_type} dim={b === "erledigt" || b === "doppelt"} />;
          })}
        </div>
        {byDate.length > 5 && <button type="button" onClick={() => setAll(!all)} className="w-full bg-surface border-t border-line py-5 text-[14px] font-semibold text-selected hover:bg-canvas">{all ? "Weniger anzeigen" : `Alle ${byDate.length} anzeigen`}</button>}
      </section>
      {BUCKETS.map((b) => {
        const list = of(b.id).filter((d) => d.id !== main?.id);
        if (!list.length) return null;
        return (
          <section key={b.id} className={`${CARD} overflow-hidden`}>
            <button type="button" onClick={() => setOpen({ ...open, [b.id]: !open[b.id] })} aria-expanded={open[b.id]} className="flex w-full items-center gap-3 px-4 py-5 text-left hover:bg-canvas md:px-6">
              <Badge icon={b.icon} color={b.color} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 text-[18px] leading-[26px] font-semibold">{b.title}<span className="tnum rounded-full border border-card-line px-3 py-1 text-[12px] font-semibold text-soft">{list.length}</span></span>
                <span className="block truncate text-[13px] text-muted">{b.hint}</span>
              </span>
              <ChevronDown size={16} className={`shrink-0 text-muted transition-transform ${open[b.id] ? "rotate-180" : ""}`} />
            </button>
            {open[b.id] && (
              <div>
                <Head />
                <div className="divide-y divide-line">
                  {list.map((d) => <Row key={d.id} d={d} note={sorted.get(d.id)?.why} dim={b.id === "erledigt" || b.id === "doppelt"} />)}
                </div>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
