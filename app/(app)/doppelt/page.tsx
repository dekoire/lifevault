"use client";
import { MergeSuggestions } from "@/components/MergeSuggestions";
import { DuplicateManager } from "@/components/Duplicates";
import { DistinctList, PartnerMerge } from "@/components/PartnerDupes";
import { BackLink, PageHeader } from "@/components/ui";
import { useDocs } from "@/lib/docs";

/** Doppelte Dokumente und doppelte Partner prüfen und zusammenführen */
export default function DoppeltPage() {
  const { allDocs } = useDocs();
  return (
    <div className="max-w-5xl space-y-8">
      <div>
        <BackLink href="/" label="Start" />
        <PageHeader title="Doppelte" subtitle="Gleiche Briefe und gleiche Partner unter anderem Namen – prüfen und zusammenführen." />
      </div>
      <MergeSuggestions />
      <section className="space-y-3">
        <h2 className="text-[17px] font-semibold">Ein Partner, mehrere Namen</h2>
        <p className="-mt-1 text-[13px] text-muted">Derselbe Absender steht bei dir unter verschiedenen Namen (z. B. „EnBW“ und „EnBW Energie Baden-Württemberg“). Gefragt wird nur, wenn es wahrscheinlich ist (ab 50 %); sehr sichere Fälle (ab 85 %) führen wir selbst zusammen. Alles steht unter „Entschieden“ und lässt sich rückgängig machen.</p>
        <PartnerMerge docs={allDocs} />
      </section>
      <section className="space-y-3">
        <h2 className="text-[17px] font-semibold">Doppelte Dokumente</h2>
        <p className="-mt-1 text-[13px] text-muted">Gleicher Inhalt – nicht nur gleiche Kennung. Unterscheidet sich nur das Datum, wurde der Brief wohl erneut geschickt. Wähle, welches du behältst – die anderen werden gelöscht.</p>
        <DuplicateManager docs={allDocs} />
        <DistinctList kind="distinct_docs" title="Als „nicht doppelt“ markiert" />
      </section>
    </div>
  );
}
