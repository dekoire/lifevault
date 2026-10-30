"use client";
import Link from "next/link";
import { useMemo } from "react";
import { AlertCircle, Check, BookOpen, FileQuestion, FileSignature, Info, PenLine, Crown, Receipt, Scale, Wallet } from "lucide-react";
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
        <Link href={`/d/${d.id}`} className={`flex items-start gap-2.5 rounded-xl bg-surface px-2.5 py-2 text-[13px] text-fg shadow-[0_1px_2px_rgba(16,24,40,.08)] transition hover:-translate-y-px hover:shadow-card ${here ? "ring-2 ring-fg" : ""}`}>
          {/* links der Absender als Avatar – man sieht sofort, von wem */}
          <span className="mt-0.5 shrink-0"><SenderLogo domain={d.sender_domain} sender={d.sender} cluster={d.cluster} size={30} /></span>
          <span className="min-w-0 flex-1">
            <span className="line-clamp-2 leading-[18px]">{w >= 4 && <Crown size={12} strokeWidth={2.2} className="mr-1 inline -translate-y-px text-fg" aria-label="wichtig" />}{short(d.title ?? d.file_name)}</span>
            <span className="tnum block text-[12px] text-muted">{when(d)}{here ? " · du bist hier" : ""}</span>
            {(due || finished(d)) && <DueChip d={d} />}
          </span>
          <span className="mt-[6px] shrink-0"><ImportanceDots value={w} size={4} /></span>
        </Link>
      </li>
    );
  };

  const [current, ...older] = data.versions;
  return (
    <section className={`${CARD} mt-4 p-5 md:p-6`}>
      <h2 className="text-[18px] leading-[26px] font-semibold">{data.health ? `Verlauf bei ${data.name}` : "So hängt alles zusammen"}</h2>
      <p className="mt-0.5 text-[13px] text-muted">{data.health ? "Alles in zeitlicher Reihenfolge, das Neueste oben. Krone = wichtig, rot = da musst du etwas tun." : "Oben der Vertrag, darunter alles, was dazugehört – nach Bedeutung sortiert. Krone = wichtig, rot = da musst du etwas tun."}</p>

      {/* Vertrag: aktuelle Fassung oben, frühere darunter (beim Arzt meist keiner – dann nur der Verlauf) */}
      {(current || !data.health) && <div className="mt-4 flex flex-col items-center">
        {current ? (
          <Link href={`/d/${current.id}`} className={`w-full max-w-sm rounded-2xl bg-brand-500 px-4 py-3 text-center text-white shadow-card hover:brightness-105 ${current.id === doc.id ? "ring-4 ring-brand-500/25" : ""}`}>
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-white/80 uppercase"><FileSignature size={12} /> Vertrag · aktuelle Fassung{current.id === doc.id ? " · du bist hier" : ""}</span>
            <b className="block truncate text-[15px] leading-6">{short(current.title ?? current.file_name)}</b>
            <span className="block text-[12px] text-white/80">{data.name} · {current.doc_type ?? "Vertrag"} vom {fmtDate(dateOf(current))}</span>
          </Link>
        ) : (
          <div className="w-full max-w-sm rounded-2xl border border-card-line bg-surface-2 px-5 py-4 text-center">
            <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-muted"><FileQuestion size={13} /> Kein Vertrag hinterlegt</span>
            <b className="block text-[15px] leading-6">{data.name}</b>
            <span className="block text-[12px] text-muted">Lade den Vertrag hoch – dann siehst du hier, was gilt und was dazugehört.</span>
          </div>
        )}
        {older.map((v) => (
          <div key={v.id} className="flex w-full max-w-xs flex-col items-center">
            <span className="h-3 w-px bg-line-strong" aria-hidden />
            <Link href={`/d/${v.id}`} className={`w-full rounded-xl border border-card-line bg-surface-2 px-3 py-2 text-center opacity-80 hover:opacity-100 ${v.id === doc.id ? "ring-2 ring-brand-500/40" : ""}`}>
              <span className="block text-[11px] font-semibold tracking-wide text-muted uppercase">Frühere Fassung{v.id === doc.id ? " · du bist hier" : ""}</span>
              <span className="block truncate text-[13px] font-semibold">{short(v.title ?? v.file_name)}</span>
              <span className="block text-[12px] text-muted">{fmtDate(dateOf(v))}{v.archived ? " · nicht mehr gültig" : ""}</span>
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
                  <span className={`absolute top-3 -left-[6px] h-2.5 w-2.5 rounded-full ring-2 ring-surface ${here ? "bg-brand-500" : due ? "bg-negative" : finished(d) ? "bg-positive" : "bg-line-strong"}`} aria-hidden />
                  {(() => { const k = knownDate(d, docs); return <span className="tnum w-12 shrink-0 pt-px text-[12px] text-muted" title={k.how === "dokument" ? "Datum auf dem Dokument" : k.how === "mappe" ? "Datum der Mappe, aus der das Blatt stammt" : "kein Datum auf dem Dokument – Eingang"}>{fmtDate(k.iso).slice(0, 6)}{k.how !== "dokument" && <span className="block text-[10px] leading-3">{k.how === "mappe" ? "Mappe" : "Eingang"}</span>}</span>; })()}
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 text-[14px] leading-[18px] font-semibold">{weight(d) >= 4 && <Crown size={12} strokeWidth={2.2} className="mr-1 inline text-fg" aria-label="wichtig" />}{short(d.title ?? d.file_name)}</span>
                    <span className="mt-0.5 flex items-center gap-2 text-[12px] text-muted"><KindTag d={d} />{here && "du bist hier"}<DueChip d={d} /></span>
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
                <div key={g.id} className="relative w-full rounded-2xl p-2.5 text-white shadow-card sm:w-[270px]" style={{ background: `linear-gradient(160deg, ${GROUP_COLOR[g.id]}, color-mix(in srgb, ${GROUP_COLOR[g.id]} 82%, black))` }}>
                  <span className="absolute -top-4 left-1/2 h-4 w-px bg-line-strong" aria-hidden />
                  <div className="px-1.5 pt-0.5 pb-1">
                    <span className="flex items-center gap-1.5 text-[14px] font-semibold"><span className="opacity-90">{g.icon}</span>{g.title}<span className="tnum ml-auto rounded-full bg-white/20 px-3 text-[12px] font-bold">{list.length}</span></span>
                    <span className="mt-0.5 block text-[12px] leading-[17px] text-white/80">{due ? <b className="font-semibold text-white">{due} offen · </b> : null}{g.means}</span>
                  </div>
                  <ul className="mt-1.5 space-y-1.5">{list.slice(0, 4).map((d) => <Leaf key={d.id} d={d} />)}</ul>
                  {list.length > 4 && <Link href={`/partner/${data.partner}`} className="mt-2 block px-1.5 text-[12px] font-semibold text-white/90 hover:underline">+ {list.length - 4} weitere</Link>}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
