"use client";
import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Combine, Copy, History, Users, type LucideIcon } from "lucide-react";
import { MergeSuggestions } from "@/components/MergeSuggestions";
import { DuplicateManager, useDuplicates } from "@/components/Duplicates";
import { DistinctList, MergeHistory, PartnerMerge, usePartnerDuplicates } from "@/components/PartnerDupes";
import { BackLink, CARD, PageHeader } from "@/components/ui";
import { useDocs } from "@/lib/docs";

type Tab = "docs" | "parts" | "partner" | "verlauf";
/** je Reiter: Icon, kurzer Hinweis (nur wenn es etwas gibt) und was die leere Kachel sagt */
const TABS: { id: Tab; label: string; icon: LucideIcon; hint: string; empty: string }[] = [
  { id: "docs", label: "Doppelte Dokumente", icon: Copy, hint: "Gleiches Dokument mehrmals abgelegt. Tippe an, was bleibt – der Rest wird gelöscht.", empty: "Kein Dokument liegt doppelt." },
  { id: "parts", label: "Gehören zusammen", icon: Combine, hint: "Einzelne Seiten eines Dokuments, z. B. Vorder- und Rückseite – zusammenfügen zu einem.", empty: "Keine losen Seiten gefunden." },
  { id: "partner", label: "Absender", icon: Users, hint: "Ein Absender unter mehreren Namen. Zusammenlegen ändert nur den Namen, gelöscht wird nichts.", empty: "Jeder Absender hat nur einen Namen." },
  { id: "verlauf", label: "Verlauf", icon: History, hint: "Was du schon entschieden hast – alles lässt sich rückgängig machen.", empty: "" },
];

/** Aufräumen: doppelte Dokumente, zusammengehörende Teile, doppelte Absender und der Verlauf – je ein Reiter */
export default function DoppeltPage() {
  const { allDocs } = useDocs();
  const { groups } = useDuplicates(allDocs);
  const { groups: partnerGroups } = usePartnerDuplicates(allDocs);
  const [tab, setTab] = useState<Tab>("docs");
  const t = TABS.find((x) => x.id === tab)!;
  const count: Partial<Record<Tab, number>> = { docs: groups.length, partner: partnerGroups.length };
  const hint = <Hint icon={t.icon} text={t.hint} />;
  const empty = <Empty text={t.empty} />;
  return (
    <div className="max-w-5xl">
      <BackLink href="/" label="Start" />
      <PageHeader title="Aufräumen" subtitle="Doppeltes und Zusammengehörendes – du entscheidest." />
      <Pills>
        {TABS.map((x) => {
          const on = x.id === tab;
          const n = count[x.id];
          return (
            <button key={x.id} type="button" onClick={() => setTab(x.id)} aria-pressed={on} className={`inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full border px-4 text-[14px] font-semibold whitespace-nowrap ${on ? "border-fg bg-fg text-canvas" : "border-card-line bg-surface text-fg hover:bg-surface-2"}`}>
              <x.icon size={15} /> {x.label}{n ? <span className={`tnum rounded-full px-1.5 text-[12px] ${on ? "bg-canvas/20" : "bg-surface-3"}`}>{n}</span> : null}
            </button>
          );
        })}
      </Pills>
      <div className="mt-4 space-y-3">
        {tab === "docs" && (groups.length ? <>{hint}<DuplicateManager docs={allDocs} /></> : empty)}
        {tab === "parts" && <MergeSuggestions intro={hint} empty={empty} />}
        {tab === "partner" && (partnerGroups.length ? <>{hint}<PartnerMerge docs={allDocs} /></> : empty)}
        {tab === "verlauf" && (
          <>
            {hint}
            <MergeHistory />
            <DistinctList kind="distinct_docs" title="Dokumente: als verschieden markiert" />
            <DistinctList kind="distinct" title="Absender: als verschieden markiert" />
          </>
        )}
      </div>
    </div>
  );
}

/** Pills zum Wischen; ist etwas abgeschnitten, blendet links/rechts ein Verlauf aus */
function Pills({ children }: { children: React.ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState({ l: false, r: false });
  const measure = () => { const el = box.current; if (el) setEdge({ l: el.scrollLeft > 4, r: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 }); };
  useEffect(() => { measure(); addEventListener("resize", measure); return () => removeEventListener("resize", measure); }, []);
  return (
    <div className="relative -mx-4 sm:mx-0">
      <div ref={box} onScroll={measure} className="flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] sm:px-0 [&::-webkit-scrollbar]:hidden">{children}</div>
      <span aria-hidden className={`pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-page to-transparent transition-opacity ${edge.l ? "opacity-100" : "opacity-0"}`} />
      <span aria-hidden className={`pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-page to-transparent transition-opacity ${edge.r ? "opacity-100" : "opacity-0"}`} />
    </div>
  );
}

function Hint({ icon: Icon, text }: { icon: LucideIcon; text: string }) {
  return <p className="flex items-start gap-3 rounded-2xl border border-card-line bg-surface px-4 py-3 text-[14px] leading-5 text-soft"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-fg text-canvas"><Icon size={15} /></span><span className="pt-1.5">{text}</span></p>;
}

function Empty({ text }: { text: string }) {
  return (
    <div className={`${CARD} flex flex-col items-center px-6 py-16 text-center`}>
      <span className="grid h-14 w-14 place-items-center rounded-full bg-positive/10 text-positive-text"><CheckCircle2 size={28} /></span>
      <b className="mt-4 text-[17px]">Alles aufgeräumt</b>
      <span className="mt-1 text-[14px] text-muted">{text}</span>
    </div>
  );
}
