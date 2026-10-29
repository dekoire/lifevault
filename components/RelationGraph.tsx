"use client";
import Link from "next/link";
import { useMemo } from "react";
import { AlertCircle, Archive, FileSignature, Info, PenLine, Receipt, Star } from "lucide-react";
import { ImportanceDots } from "@/components/Importance";
import { CARD } from "@/components/ui";
import { fmtDate, useDocs } from "@/lib/docs";
import { importanceOf } from "@/lib/importance";
import { partnerKey } from "@/lib/partners";
import type { Doc } from "@/lib/types";

const dateOf = (d: Doc) => d.doc_date ?? d.received_at.slice(0, 10);
const INVOICE = /rechnung|mahnung|zahlungserinnerung|zahlungsaufforderung|abrechnung|forderung|lastschrift|beitragsrechnung/i;
const TERMS = /bedingung|avb|agb|police|versicherungsschein|vertrag|tarif|leistungsbeschreibung/i;

type Group = "vertrag" | "aenderung" | "zahlung" | "info";
const GROUPS: { id: Group; title: string; means: string; icon: React.ReactNode }[] = [
  { id: "vertrag", title: "Vertrag & Bedingungen", means: "Was gilt: Leistungen, Laufzeit, Kündigung. Hier schaust du nach, wenn etwas ist.", icon: <FileSignature size={15} /> },
  { id: "aenderung", title: "Änderungen", means: "Beitrag oder Bedingungen geändert. Die neueste gilt, ältere sind überholt.", icon: <PenLine size={15} /> },
  { id: "zahlung", title: "Rechnungen & Mahnungen", means: "Nur wichtig, solange etwas offen ist – dann mit Frist.", icon: <Receipt size={15} /> },
  { id: "info", title: "Hinweise & Infos", means: "Pflicht-Infos, Belehrungen, Werbung – gut zu haben, selten gebraucht.", icon: <Info size={15} /> },
];

function groupOf(d: Doc): Group {
  const t = `${d.doc_type ?? ""} ${d.title ?? ""}`;
  if (d.partner_role === "aenderung" || /anpassung|änderung|nachtrag|kündigung/i.test(t)) return "aenderung";
  if (INVOICE.test(t) || d.partner_role === "laufend") return "zahlung";
  if (d.partner_role === "grundlage" || TERMS.test(t)) return "vertrag";
  return "info";
}

/**
 * Mindmap zum Vertrag: in der Mitte das Hauptdokument (Vertrag/Police) des Partners, darum die Dokumente nach Bedeutung
 * gruppiert – Vertrag & Bedingungen, Änderungen, Rechnungen & Mahnungen, Hinweise. Je Gruppe ein Satz, was sie bedeutet;
 * je Dokument Wichtigkeit (★ ab „sehr wichtig“), offene Fristen rot. Rechnungen zählen nur, solange sie offen sind.
 */
export function RelationGraph({ doc }: { doc: Doc }) {
  const { docs } = useDocs();
  const today = new Date().toISOString().slice(0, 10);
  const data = useMemo(() => {
    if (!doc.sender) return null;
    const k = partnerKey(doc.sender);
    const all = docs.filter((d) => d.sender && partnerKey(d.sender) === k);
    if (all.length < 2) return null;
    const active = all.filter((d) => !d.archived);
    // Mitte: die gültige Grundlage, an der am meisten hängt (sonst die wichtigste)
    const hang = (d: Doc) => all.filter((x) => x.basis_id === d.id).length;
    const center = [...active].filter((d) => d.partner_role === "grundlage").sort((a, b) => hang(b) - hang(a) || importanceOf(b) - importanceOf(a) || dateOf(b).localeCompare(dateOf(a)))[0]
      ?? [...active].sort((a, b) => importanceOf(b) - importanceOf(a))[0] ?? doc;
    const groups = new Map<Group, Doc[]>();
    for (const d of active) if (d.id !== center.id) groups.set(groupOf(d), [...(groups.get(groupOf(d)) ?? []), d]);
    return { center, groups, archived: all.filter((d) => d.archived).length, partner: k };
  }, [doc, docs]);
  if (!data) return null;
  const open = (d: Doc) => (d.deadlines ?? []).find((x) => x.date >= today);
  // wirksame Wichtigkeit: Rechnungen ohne offene Frist zählen wenig
  const weight = (d: Doc) => (groupOf(d) === "zahlung" && !open(d) ? Math.min(2, importanceOf(d)) : importanceOf(d));
  const shown = GROUPS.filter((g) => data.groups.get(g.id)?.length);
  // Partnername aus Titeln streichen („AVB Rechtsschutzversicherung Adam Riese L 2023“ → „AVB Rechtsschutzversicherung L 2023“)
  const names = [...new Set([doc.sender ?? "", data.center.sender ?? ""].filter((n) => n.length >= 3))];
  const short = (t: string) => names.reduce((x, n) => x.replace(new RegExp(`\\s*${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*`, "gi"), " "), t).replace(/\s+/g, " ").replace(/^[\s–-]+|[\s–-]+$/g, "").trim() || t;

  const Leaf = ({ d }: { d: Doc }) => {
    const due = open(d);
    const w = weight(d);
    const here = d.id === doc.id;
    return (
      <li>
        <Link href={`/d/${d.id}`} className={`flex items-start gap-2 rounded-lg px-2 py-1.5 text-[13px] hover:bg-surface-2 ${here ? "bg-brand-500/10 ring-1 ring-brand-500/40" : ""}`}>
          {w >= 4 ? <Star size={13} className="mt-[3px] shrink-0 fill-brand-500 text-brand-500" /> : <span className="w-[13px] shrink-0" />}
          <span className="min-w-0 flex-1">
            {/* Titel ohne den Partnernamen (steht schon in der Mitte), höchstens zwei Zeilen */}
            <span className="line-clamp-2 leading-[18px]">{short(d.title ?? d.file_name)}</span>
            {due ? <span className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-negative/10 px-1.5 py-px text-[11px] font-semibold text-negative-text"><AlertCircle size={11} /> {d.doc_type ?? "Frist"} bis {fmtDate(due.date)}</span> : <span className="tnum block text-[11.5px] text-muted">{fmtDate(dateOf(d))}{here ? " · du bist hier" : ""}</span>}
          </span>
          <span className="mt-[6px] shrink-0"><ImportanceDots value={w} size={4} /></span>
        </Link>
      </li>
    );
  };

  return (
    <section className={`${CARD} mt-4 p-4`}>
      <h2 className="text-[15px] font-semibold">So hängt alles zusammen</h2>
      <p className="mt-0.5 text-[12.5px] text-muted">In der Mitte der Vertrag, darum alles, was dazugehört – nach Bedeutung sortiert. ★ = wichtig, rot = da musst du etwas tun.</p>

      {/* Mitte */}
      <div className="mt-4 flex justify-center">
        <Link href={`/d/${data.center.id}`} className={`relative max-w-md rounded-2xl bg-brand-500 px-4 py-3 text-center text-white shadow-card hover:brightness-105 ${data.center.id === doc.id ? "ring-4 ring-brand-500/25" : ""}`}>
          <span className="block text-[11px] font-semibold tracking-wide text-white/80 uppercase">Vertrag{data.center.id === doc.id ? " · du bist hier" : ""}</span>
          <b className="block truncate text-[15px] leading-6">{data.center.title ?? data.center.file_name}</b>
          <span className="block text-[12px] text-white/80">{data.center.doc_type ?? ""}{data.center.doc_type ? " · " : ""}seit {fmtDate(dateOf(data.center))}</span>
        </Link>
      </div>

      {/* Äste: Verbindungslinie oben, Gruppen darunter verteilt */}
      {shown.length > 0 && (
        <div className="relative mt-3">
          <div className="mx-auto h-4 w-px bg-line-strong" aria-hidden />
          <div className={`grid gap-3 border-t border-line-strong pt-4 ${shown.length >= 4 ? "sm:grid-cols-2 xl:grid-cols-4" : shown.length === 3 ? "sm:grid-cols-3" : shown.length === 2 ? "sm:grid-cols-2" : ""}`}>
            {shown.map((g) => {
              const list = [...(data.groups.get(g.id) ?? [])].sort((a, b) => Number(!!open(b)) - Number(!!open(a)) || weight(b) - weight(a) || dateOf(b).localeCompare(dateOf(a)));
              const due = list.filter(open).length;
              return (
                <div key={g.id} className="relative rounded-xl border border-card-line bg-surface p-2.5">
                  <span className="absolute -top-4 left-1/2 h-4 w-px bg-line-strong" aria-hidden />
                  <div className="px-1">
                    <span className="flex items-center gap-1.5 text-[13.5px] font-semibold">{g.icon}{g.title}<span className="tnum ml-auto rounded-full border border-card-line px-1.5 text-[11px] font-semibold text-soft">{list.length}</span></span>
                    <span className="mt-0.5 block text-[12px] leading-[17px] text-muted">{due ? <b className="font-semibold text-negative-text">{due} offen · </b> : null}{g.means}</span>
                  </div>
                  <ul className="mt-1.5 space-y-0.5">{list.slice(0, 4).map((d) => <Leaf key={d.id} d={d} />)}</ul>
                  {list.length > 4 && <Link href={`/partner/${data.partner}`} className="mt-1 block px-2 text-[12px] font-semibold text-selected hover:underline">+ {list.length - 4} weitere</Link>}
                </div>
              );
            })}
          </div>
        </div>
      )}
      {data.archived > 0 && (
        <Link href={`/partner/${data.partner}`} className="mt-3 inline-flex items-center gap-1.5 text-[12.5px] text-muted hover:text-fg"><Archive size={13} /> {data.archived} erledigt oder veraltet – im Archiv</Link>
      )}
    </section>
  );
}
