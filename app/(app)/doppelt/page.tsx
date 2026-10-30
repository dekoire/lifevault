"use client";
import { useState } from "react";
import { Combine, Copy, History, Users } from "lucide-react";
import { MergeSuggestions } from "@/components/MergeSuggestions";
import { DuplicateManager, useDuplicates } from "@/components/Duplicates";
import { DistinctList, MergeHistory, PartnerMerge, usePartnerDuplicates } from "@/components/PartnerDupes";
import { BackLink, PageHeader, Segmented } from "@/components/ui";
import { useDocs } from "@/lib/docs";

type Tab = "docs" | "parts" | "partner" | "verlauf";
/** je Reiter in einfachen Worten: was du hier siehst und was beim Antippen passiert */
const HELP: Record<Tab, { title: string; points: string[] }> = {
  docs: { title: "Gleiches Dokument mehrfach abgelegt", points: ["Markiere, was du behalten willst – eins, mehrere oder alle.", "Nicht Markiertes wird gelöscht. Was du behältst, fragen wir nicht noch einmal."] },
  parts: { title: "Teile eines Dokuments", points: ["Kurz nacheinander hochgeladene Seiten, die zusammengehören (z. B. Vorder- und Rückseite).", "Zusammenfügen macht daraus ein Dokument mit allen Seiten. „Nein“ lässt sie getrennt."] },
  partner: { title: "Ein Absender unter mehreren Namen", points: ["Z. B. „EnBW“ und „EnBW Energie Baden-Württemberg“.", "Zusammenlegen ändert nur den Absender-Namen der Dokumente – gelöscht wird nichts, rückgängig geht jederzeit."] },
  verlauf: { title: "Was schon entschieden ist", points: ["Zusammengelegte und umbenannte Absender – mit „Rückgängig“.", "Als verschieden markiert – mit „Doch prüfen“ kommen sie wieder in die Liste."] },
};

/** Aufräumen: doppelte Dokumente, zusammengehörende Teile, doppelte Absender und der Verlauf – je ein Reiter */
export default function DoppeltPage() {
  const { allDocs } = useDocs();
  const { groups } = useDuplicates(allDocs);
  const { groups: partnerGroups } = usePartnerDuplicates(allDocs);
  const [tab, setTab] = useState<Tab>("docs");
  const n = (x: number) => (x ? ` ${x}` : "");
  const h = HELP[tab];
  return (
    <div className="max-w-5xl">
      <BackLink href="/" label="Start" />
      <PageHeader title="Aufräumen" subtitle="Doppeltes finden, Zusammengehörendes zusammenfügen – du entscheidest jeden Fall." />
      <div className="-mx-4 mb-4 overflow-x-auto px-4 [scrollbar-width:none]">
        <Segmented value={tab} onChange={setTab} options={[
          { id: "docs", label: `Doppelte Dokumente${n(groups.length)}`, icon: <Copy size={14} /> },
          { id: "parts", label: "Gehören zusammen", icon: <Combine size={14} /> },
          { id: "partner", label: `Absender${n(partnerGroups.length)}`, icon: <Users size={14} /> },
          { id: "verlauf", label: "Verlauf", icon: <History size={14} /> },
        ]} />
      </div>
      <div className="mb-4 rounded-2xl border border-card-line bg-surface px-4 py-3">
        <p className="text-[14px] font-semibold">{h.title}</p>
        <ul className="mt-1 space-y-0.5 text-[13px] text-soft">{h.points.map((p) => <li key={p} className="flex gap-2"><span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-soft" />{p}</li>)}</ul>
      </div>
      {tab === "docs" && <DuplicateManager docs={allDocs} />}
      {tab === "parts" && (<><MergeSuggestions /><p className="mt-3 text-center text-[13px] text-muted">Werden beim Hochladen erkannt. Steht hier nichts, ist nichts offen.</p></>)}
      {tab === "partner" && <PartnerMerge docs={allDocs} />}
      {tab === "verlauf" && (
        <div className="space-y-3">
          <MergeHistory />
          <DistinctList kind="distinct_docs" title="Dokumente: als verschieden markiert" />
          <DistinctList kind="distinct" title="Absender: als verschieden markiert" />
        </div>
      )}
    </div>
  );
}
