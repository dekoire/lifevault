"use client";
import { MergeSuggestions } from "@/components/MergeSuggestions";
import { DuplicateManager } from "@/components/Duplicates";
import { MergeHistory, PartnerMerge } from "@/components/PartnerDupes";
import { BackLink, PageHeader } from "@/components/ui";
import { useDocs } from "@/lib/docs";

/** Doppelte Dokumente und doppelte Partner prüfen und zusammenführen */
export default function DoppeltPage() {
  const { allDocs } = useDocs();
  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <BackLink href="/" label="Start" />
        <PageHeader title="Doppelte" subtitle="Gleiche Briefe und gleiche Partner unter anderem Namen – prüfen und zusammenführen." />
      </div>
      <MergeSuggestions />
      <section className="space-y-3">
        <h2 className="text-[17px] font-semibold">Gleiche Partner?</h2>
        <p className="-mt-1 text-[13px] text-muted">Gleiche Kunden- oder Vertragsnummer, Adresse, Telefon, Webadresse oder Name – etwa nach Umbenennung oder Rebranding. Beim Zusammenführen bekommen alle Dokumente den gewählten Namen; gelöscht wird nichts.</p>
        <PartnerMerge docs={allDocs} />
        <MergeHistory />
      </section>
      <section className="space-y-3">
        <h2 className="text-[17px] font-semibold">Doppelte Dokumente</h2>
        <p className="-mt-1 text-[13px] text-muted">Gleicher Inhalt – nicht nur gleiche Kennung. Unterscheidet sich nur das Datum, wurde der Brief wohl erneut geschickt. Wähle, welches du behältst – die anderen werden gelöscht.</p>
        <DuplicateManager docs={allDocs} />
      </section>
    </div>
  );
}
