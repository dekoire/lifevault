"use client";
import { Panel } from "@/components/Panel";
import { IconTile } from "@/components/ClusterIcon";
import Link from "next/link";
import { useMemo } from "react";
import { AlertCircle, Check, Network, BookOpen, FileQuestion, FileSignature, Info, PenLine, Crown, Receipt, Scale, Wallet } from "lucide-react";
import { KindTag } from "@/components/KindTag";
import { SenderLogo } from "@/components/SenderLogo";
import { ImportanceDots } from "@/components/Importance";
import { CARD } from "@/components/ui";
import { fmtDate, knownDate, knownDateLabel, useDocs } from "@/lib/docs";
import { importanceOf } from "@/lib/importance";
import { partnerKey } from "@/lib/partners";
import { todoKey, useTodoDone } from "@/lib/todoDone";
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
/** Farbe je Gruppe: Kachel vollflächig, Einträge darin weiß */
const GROUP_COLOR: Record<Group, string> = { bedingungen: "#2563eb", aenderung: "#d97706", zahlung: "#059669", info: "#64748b" };
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
  const { done, toggle } = useTodoDone();
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
  // offen = anstehende Frist, die du noch nicht abgehakt hast (gleicher Haken wie in „Zu erledigen“)
  const isDone = (d: Doc, date: string) => done.includes(todoKey(d.id, date));
  const open = (d: Doc) => (d.deadlines ?? []).find((x) => x.date >= today && !isDone(d, x.date));
  const finished = (d: Doc) => !open(d) && (d.deadlines ?? []).some((x) => isDone(d, x.date));
  // Datum: das Datum auf dem Dokument; fehlt es, das Hochladedatum – dann so beschriftet
  const when = (d: Doc) => knownDateLabel(knownDate(d, docs));
  const check = (d: Doc, date: string) => (e: React.MouseEvent) => { e.preventDefault(); e.stopPropagation(); toggle(todoKey(d.id, date)); };
  const DueChip = ({ d }: { d: Doc }) => {
    const due = open(d);
    if (due) return <span role="button" tabIndex={0} onClick={check(d, due.date)} title="Antippen: als erledigt abhaken" className="mt-0.5 inline-flex items-center gap-1 text-[12px] font-semibold text-negative-text hover:text-positive-text"><AlertCircle size={11} /> bis {fmtDate(due.date)}</span>;
    const last = [...(d.deadlines ?? [])].filter((x) => isDone(d, x.date)).sort((a, b) => b.date.localeCompare(a.date))[0];
    if (last) return <span role="button" tabIndex={0} onClick={check(d, last.date)} title="Antippen: wieder offen" className="mt-0.5 inline-flex items-center gap-1 text-[12px] font-semibold text-positive-text"><Check size={11} strokeWidth={3} /> erledigt</span>;
    return null;
  };
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
        <Link href={`/d/${d.id}`} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-canvas ${here ? "bg-brand-500/[.06]" : ""}`}>
          <SenderLogo domain={d.sender_domain} sender={d.sender} cluster={d.cluster} size={30} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[14px] font-semibold">{w >= 4 && <Crown size={12} strokeWidth={2.2} className="mr-1 inline -translate-y-px" aria-label="wichtig" />}{short(d.title ?? d.file_name)}</span>
            <span className="tnum flex items-center gap-2 text-[12px] text-muted">{when(d)}{here ? " · du bist hier" : ""}{(due || finished(d)) && <DueChip d={d} />}</span>
          </span>
          <ImportanceDots value={w} size={4} />
        </Link>
      </li>
    );
  };


  const [current, ...older] = data.versions;
  return (
    <div className="mt-4">
    <Panel title={data.health ? `Verlauf bei ${data.name}` : "So hängt alles zusammen"} icon={Network} color="#475569"
      sub={data.health ? "Das Neueste oben · Krone = wichtig" : "Vertrag oben, darunter was dazugehört"} defaultOpen={false}>
      <div className="px-5 py-4">
      {/* Vertrag: aktuelle Fassung oben, frühere darunter */}
      {(current || !data.health) && <div className="space-y-2">
        {current ? (
          <Link href={`/d/${current.id}`} className={`flex items-center gap-3 rounded-2xl bg-brand-500 px-4 py-3.5 text-white hover:brightness-105 ${current.id === doc.id ? "ring-4 ring-brand-500/25" : ""}`}>
            <FileSignature size={20} className="shrink-0" />
            <span className="min-w-0 flex-1">
              <span className="block text-[12px] text-white/80">Vertrag · aktuelle Fassung{current.id === doc.id ? " · du bist hier" : ""}</span>
              <b className="block truncate text-[15px] leading-6">{short(current.title ?? current.file_name)}</b>
            </span>
            <span className="tnum shrink-0 text-[12px] text-white/80">{fmtDate(dateOf(current))}</span>
          </Link>
        ) : (
          <div className="flex items-center gap-3 rounded-2xl border border-card-line bg-canvas px-4 py-3.5">
            <IconTile icon={FileQuestion} color="#64748b" size={32} />
            <span className="min-w-0"><b className="block text-[14px]">Kein Vertrag hinterlegt</b><span className="block text-[12px] text-muted">Lade den Vertrag hoch – dann siehst du hier, was gilt.</span></span>
          </div>
        )}
        {older.map((v) => (
          <Link key={v.id} href={`/d/${v.id}`} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-soft hover:bg-canvas ${v.id === doc.id ? "bg-brand-500/[.06]" : ""}`}>
            <FileSignature size={16} className="shrink-0" />
            <span className="min-w-0 flex-1 truncate text-[13px]"><b className="font-semibold text-fg">Frühere Fassung</b> · {short(v.title ?? v.file_name)}</span>
            <span className="tnum shrink-0 text-[12px] text-muted">{fmtDate(dateOf(v))}</span>
          </Link>
        ))}
      </div>}

      {/* Gesundheit: zeitlicher Verlauf */}
      {data.health && data.timeline.length > 0 && (
        <ul className="-mx-3">
          {data.timeline.slice(0, 14).map((d) => <Leaf key={d.id} d={d} />)}
          {data.timeline.length > 14 && <li><Link href={`/partner/${data.partner}`} className="block px-3 py-2 text-[13px] font-semibold text-selected hover:underline">+ {data.timeline.length - 14} frühere</Link></li>}
        </ul>
      )}

      {/* was dazugehört: Gruppen untereinander, durch Linien getrennt */}
      {shown.map((g) => {
        const list = [...(data.groups.get(g.id) ?? [])].sort((a, b) => Number(!!open(b)) - Number(!!open(a)) || (data.mode === "arbeit" && g.id === "zahlung" ? 0 : weight(b) - weight(a)) || dateOf(b).localeCompare(dateOf(a)));
        const due = list.filter(open).length;
        return (
          <div key={g.id} className="mt-4 border-t border-line pt-4">
            <div className="flex items-center gap-3">
              <IconTile color={GROUP_COLOR[g.id]} size={32}>{g.icon}</IconTile>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 text-[15px] font-semibold">{g.title}<span className="tnum rounded-full border border-card-line px-3 py-2 text-[12px] leading-4 text-soft">{list.length}</span></span>
                <span className="block truncate text-[12px] text-muted">{due ? <b className="font-semibold text-negative-text">{due} offen · </b> : null}{g.means}</span>
              </span>
            </div>
            <ul className="-mx-3 mt-2">{list.slice(0, 4).map((d) => <Leaf key={d.id} d={d} />)}</ul>
            {list.length > 4 && <Link href={`/partner/${data.partner}`} className="mt-1 inline-block text-[13px] font-semibold text-selected hover:underline">+ {list.length - 4} weitere</Link>}
          </div>
        );
      })}
      </div>
    </Panel>
    </div>
  );
}
