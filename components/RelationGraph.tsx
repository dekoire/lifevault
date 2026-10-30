"use client";
import Link from "next/link";
import { useMemo } from "react";
import { AlertCircle, Archive, BookOpen, FileQuestion, FileSignature, Info, PenLine, Receipt, Scale, Star, Wallet } from "lucide-react";
import { KindTag } from "@/components/KindTag";
import { ImportanceDots } from "@/components/Importance";
import { CARD } from "@/components/ui";
import { fmtDate, useDocs } from "@/lib/docs";
import { importanceOf } from "@/lib/importance";
import { partnerKey } from "@/lib/partners";
import type { Doc } from "@/lib/types";

const dateOf = (d: Doc) => d.doc_date ?? d.received_at.slice(0, 10);
// „Anrechnung“ (z. B. Dienstzeitanrechnung) ist keine Rechnung
const INVOICE = /(?<!an)rechnung|mahnung|zahlungserinnerung|zahlungsaufforderung|zahlschein|abrechnung|forderung|lastschrift|umsatz/i;
const PAY = /gehalt|entgelt|lohn|bezüge|vergütung|abrechnung|sozialversicherung|dienstzeit|zeitanrechnung|sepa|lastschrift|verpflegung|prämie|bonus|zulage|urlaubsgeld|weihnachtsgeld/i;
const RULES = /betriebsvereinbarung|tarifvertrag|richtlinie|ordnung|verpflichtung|vertraulich|geheimhaltung|datenschutz|bedingung|regelung/i;
const TERMS = /bedingung|avb|agb|tarif|leistungsbeschreibung|produktinformation|informationsblatt/i;
const CONTRACT = /police|versicherungsschein|vertrag|mitgliedschaft|kontoeröffnung|vereinbarung/i;

type Group = "bedingungen" | "aenderung" | "zahlung" | "info";
type Mode = "standard" | "arbeit";
type GroupDef = { id: Group; title: string; means: string; icon: React.ReactNode };
/** Gruppen je Bereich benannt: beim Arbeitgeber geht es um Gehalt und Regeln, nicht um Rechnungen */
const GROUPS: Record<Mode, GroupDef[]> = {
  standard: [
    { id: "bedingungen", title: "Bedingungen", means: "Was genau gilt: Leistungen, Ausschlüsse, Kündigung. Zum Nachschlagen.", icon: <BookOpen size={15} /> },
    { id: "aenderung", title: "Änderungen", means: "Beitrag oder Bedingungen geändert. Die neueste gilt, ältere sind überholt.", icon: <PenLine size={15} /> },
    { id: "zahlung", title: "Rechnungen & Zahlungen", means: "Nur wichtig, solange etwas offen ist – dann mit Frist.", icon: <Receipt size={15} /> },
    { id: "info", title: "Hinweise & Infos", means: "Pflicht-Infos, Belehrungen, Werbung – gut zu haben, selten gebraucht.", icon: <Info size={15} /> },
  ],
  arbeit: [
    { id: "zahlung", title: "Gehalt & Abrechnung", means: "Entgeltabrechnungen, Lohnsteuerbescheinigung, Abzüge – neueste zuerst.", icon: <Wallet size={15} /> },
    { id: "aenderung", title: "Änderungen", means: "Gehalt, Stelle oder Arbeitszeit geändert. Die neueste gilt.", icon: <PenLine size={15} /> },
    { id: "bedingungen", title: "Regeln & Vereinbarungen", means: "Betriebsvereinbarungen, Richtlinien, Verpflichtungen – was im Job gilt.", icon: <Scale size={15} /> },
    { id: "info", title: "Hinweise & Infos", means: "Onboarding, Ausweis, Mitteilungen – gut zu haben, selten gebraucht.", icon: <Info size={15} /> },
  ],
};

const text = (d: Doc) => `${d.doc_type ?? ""} ${d.title ?? ""}`;
/** eine Fassung des Vertrags selbst (nicht Bedingungen, Rechnung oder Änderung) */
const isContract = (d: Doc) => d.partner_role === "grundlage" && !TERMS.test(text(d)) && !INVOICE.test(text(d)) && (CONTRACT.test(text(d)) || !/info|hinweis|belehrung/i.test(text(d)));
function groupOf(d: Doc, mode: Mode = "standard"): Group {
  const t = text(d);
  if (mode === "arbeit") {
    if (PAY.test(t)) return "zahlung";
    if (d.partner_role === "aenderung" || /änderung|erhöhung|anpassung|versetzung|nachtrag/i.test(t)) return "aenderung";
    if (RULES.test(t)) return "bedingungen";
    return "info";
  }
  if (INVOICE.test(t)) return "zahlung";
  if (d.partner_role === "aenderung" || /anpassung|änderung|nachtrag|kündigung/i.test(t)) return "aenderung";
  if (TERMS.test(t) || d.partner_role === "grundlage") return "bedingungen";
  if (d.partner_role === "laufend") return "zahlung";
  return "info";
}

/**
 * Mindmap zum Vertrag. Oben die Fassungen des Vertrags als Kette (die aktuelle oben, frühere darunter grau);
 * ohne Vertrag ein Platzhalter. Darunter die übrigen Dokumente des Partners nach Bedeutung: Bedingungen, Änderungen,
 * Rechnungen & Mahnungen, Hinweise & Infos – je Gruppe ein Satz, was sie bedeutet. Je Dokument ★ ab „sehr wichtig“,
 * Wichtigkeitspunkte, offene Fristen rot. Rechnungen ohne offene Frist zählen wenig.
 */
export function RelationGraph({ doc }: { doc: Doc }) {
  const { docs } = useDocs();
  const today = new Date().toISOString().slice(0, 10);
  const data = useMemo(() => {
    if (!doc.sender) return null;
    const k = partnerKey(doc.sender);
    const all = docs.filter((d) => d.sender && partnerKey(d.sender) === k);
    if (all.length < 2) return null;
    // Bereich des Partners (meistgenutzt): Arbeit → Gehalt statt Rechnungen, Gesundheit → zeitlicher Verlauf
    const n = new Map<string, number>();
    for (const d of all) n.set(d.cluster ?? "", (n.get(d.cluster ?? "") ?? 0) + 1);
    const cluster = [...n.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
    const mode: Mode = cluster === "arbeit" ? "arbeit" : "standard";
    // Fassungen des Vertrags: neueste gültige oben, dann ältere (auch archivierte)
    const versions = all.filter(isContract).sort((a, b) => Number(a.archived) - Number(b.archived) || dateOf(b).localeCompare(dateOf(a)));
    const vIds = new Set(versions.map((d) => d.id));
    const groups = new Map<Group, Doc[]>();
    for (const d of all) if (!d.archived && !vIds.has(d.id)) groups.set(groupOf(d, mode), [...(groups.get(groupOf(d, mode)) ?? []), d]);
    const timeline = all.filter((d) => !d.archived && !vIds.has(d.id)).sort((a, b) => dateOf(b).localeCompare(dateOf(a)));
    return { mode, health: cluster === "gesundheit", timeline, versions, groups, archived: all.filter((d) => d.archived && !vIds.has(d.id)).length, partner: k, name: all.find((d) => d.sender)?.sender ?? doc.sender };
  }, [doc, docs]);
  if (!data) return null;
  const open = (d: Doc) => (d.deadlines ?? []).find((x) => x.date >= today);
  const weight = (d: Doc) => (data.mode === "standard" && groupOf(d) === "zahlung" && !open(d) ? Math.min(2, importanceOf(d)) : importanceOf(d));
  const shown = data.health ? [] : GROUPS[data.mode].filter((g) => data.groups.get(g.id)?.length);
  // Partnername aus Titeln streichen (steht schon oben)
  const names = [...new Set([doc.sender ?? "", data.name].filter((n) => n.length >= 3))];
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
            <span className="line-clamp-2 leading-[18px]">{short(d.title ?? d.file_name)}</span>
            {due ? <span className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-negative/10 px-1.5 py-px text-[11px] font-semibold text-negative-text"><AlertCircle size={11} /> bis {fmtDate(due.date)}</span> : <span className="tnum block text-[11.5px] text-muted">{fmtDate(dateOf(d))}{here ? " · du bist hier" : ""}</span>}
          </span>
          <span className="mt-[6px] shrink-0"><ImportanceDots value={w} size={4} /></span>
        </Link>
      </li>
    );
  };

  const [current, ...older] = data.versions;
  return (
    <section className={`${CARD} mt-4 p-4`}>
      <h2 className="text-[15px] font-semibold">{data.health ? `Verlauf bei ${data.name}` : "So hängt alles zusammen"}</h2>
      <p className="mt-0.5 text-[12.5px] text-muted">{data.health ? "Alles in zeitlicher Reihenfolge, das Neueste oben. ★ = wichtig, rot = da musst du etwas tun." : "Oben der Vertrag, darunter alles, was dazugehört – nach Bedeutung sortiert. ★ = wichtig, rot = da musst du etwas tun."}</p>

      {/* Vertrag: aktuelle Fassung oben, frühere darunter (beim Arzt meist keiner – dann nur der Verlauf) */}
      {(current || !data.health) && <div className="mt-4 flex flex-col items-center">
        {current ? (
          <Link href={`/d/${current.id}`} className={`w-full max-w-sm rounded-2xl bg-brand-500 px-4 py-3 text-center text-white shadow-card hover:brightness-105 ${current.id === doc.id ? "ring-4 ring-brand-500/25" : ""}`}>
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-white/80 uppercase"><FileSignature size={12} /> Vertrag · aktuelle Fassung{current.id === doc.id ? " · du bist hier" : ""}</span>
            <b className="block truncate text-[15px] leading-6">{short(current.title ?? current.file_name)}</b>
            <span className="block text-[12px] text-white/80">{data.name} · {current.doc_type ?? "Vertrag"} vom {fmtDate(dateOf(current))}</span>
          </Link>
        ) : (
          <div className="w-full max-w-sm rounded-2xl border border-dashed border-line-strong px-4 py-3 text-center">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-muted uppercase"><FileQuestion size={12} /> Kein Vertrag hinterlegt</span>
            <b className="block text-[15px] leading-6">{data.name}</b>
            <span className="block text-[12px] text-muted">Lade den Vertrag hoch – dann siehst du hier, was gilt und was dazugehört.</span>
          </div>
        )}
        {older.map((v) => (
          <div key={v.id} className="flex w-full max-w-xs flex-col items-center">
            <span className="h-3 w-px bg-line-strong" aria-hidden />
            <Link href={`/d/${v.id}`} className={`w-full rounded-xl border border-card-line bg-surface-2 px-3 py-2 text-center opacity-80 hover:opacity-100 ${v.id === doc.id ? "ring-2 ring-brand-500/40" : ""}`}>
              <span className="block text-[10.5px] font-semibold tracking-wide text-muted uppercase">Frühere Fassung{v.id === doc.id ? " · du bist hier" : ""}</span>
              <span className="block truncate text-[13px] font-semibold">{short(v.title ?? v.file_name)}</span>
              <span className="block text-[11.5px] text-muted">{fmtDate(dateOf(v))}{v.archived ? " · nicht mehr gültig" : ""}</span>
            </Link>
          </div>
        ))}
      </div>}

      {/* Gesundheit: zeitlicher Verlauf mit Jahren statt Gruppen */}
      {data.health && data.timeline.length > 0 && (
        <ol className="mt-4">
          {data.timeline.slice(0, 14).map((d, i, list) => {
            const y = dateOf(d).slice(0, 4);
            const due = open(d);
            const here = d.id === doc.id;
            return (
              <li key={d.id}>
                {y !== (i ? dateOf(list[i - 1]).slice(0, 4) : "") && <p className="tnum mt-1 mb-1 text-[12px] font-bold text-soft">{y}</p>}
                <Link href={`/d/${d.id}`} className={`relative ml-1 flex gap-3 border-l-2 border-line py-1.5 pl-4 hover:bg-surface-2/60 ${here ? "bg-brand-500/[.06]" : ""}`}>
                  <span className={`absolute top-3 -left-[6px] h-2.5 w-2.5 rounded-full ring-2 ring-surface ${here ? "bg-brand-500" : due ? "bg-negative" : "bg-line-strong"}`} aria-hidden />
                  <span className="tnum w-12 shrink-0 pt-px text-[12px] text-muted">{fmtDate(dateOf(d)).slice(0, 6)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 text-[13.5px] leading-[18px] font-semibold">{weight(d) >= 4 && <Star size={12} className="mr-1 inline fill-brand-500 text-brand-500" />}{short(d.title ?? d.file_name)}</span>
                    <span className="mt-0.5 flex items-center gap-2 text-[11.5px] text-muted"><KindTag d={d} />{here && "du bist hier"}{due && <span className="font-semibold text-negative-text">bis {fmtDate(due.date)}</span>}</span>
                  </span>
                  <span className="mt-1.5 shrink-0"><ImportanceDots value={weight(d)} size={4} /></span>
                </Link>
              </li>
            );
          })}
          {data.timeline.length > 14 && <li><Link href={`/partner/${data.partner}`} className="mt-1 block pl-5 text-[12px] font-semibold text-selected hover:underline">+ {data.timeline.length - 14} frühere</Link></li>}
        </ol>
      )}

      {/* darunter: was dazugehört – zentriert, Linie nur so breit wie die Gruppen */}
      {shown.length > 0 && (
        <div className="mt-1 flex flex-col items-center">
          <span className="h-4 w-px bg-line-strong" aria-hidden />
          <div className={`flex w-full flex-wrap justify-center gap-3 pt-4 sm:w-fit sm:max-w-full ${shown.length > 1 ? "border-t border-line-strong" : ""}`}>
            {shown.map((g) => {
              // Gehalt: neueste zuerst; sonst Offenes, dann Wichtiges
              const list = [...(data.groups.get(g.id) ?? [])].sort((a, b) => Number(!!open(b)) - Number(!!open(a)) || (data.mode === "arbeit" && g.id === "zahlung" ? 0 : weight(b) - weight(a)) || dateOf(b).localeCompare(dateOf(a)));
              const due = list.filter(open).length;
              return (
                <div key={g.id} className="relative w-full rounded-xl border border-card-line bg-surface p-2.5 sm:w-[270px]">
                  <span className="absolute -top-4 left-1/2 h-4 w-px bg-line-strong" aria-hidden />
                  <div className="px-1">
                    <span className="flex items-center gap-1.5 text-[13.5px] font-semibold"><span className="text-muted">{g.icon}</span>{g.title}<span className="tnum ml-auto rounded-full border border-card-line px-1.5 text-[11px] font-semibold text-soft">{list.length}</span></span>
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
