"use client";
import { DuplicateManager } from "@/components/Duplicates";
import { PartnerMerge } from "@/components/PartnerDupes";
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
      <section className="space-y-3">
        <h2 className="text-[17px] font-semibold">Gleiche Partner?</h2>
        <p className="-mt-1 text-[13px] text-muted">Gleiche Kunden- oder Vertragsnummer, Adresse, Telefon, Webadresse oder Name – etwa nach Umbenennung oder Rebranding. Beim Zusammenführen bekommen alle Dokumente den gewählten Namen; gelöscht wird nichts.</p>
        <PartnerMerge docs={allDocs} />
      </section>
      <section className="space-y-3">
        <h2 className="text-[17px] font-semibold">Doppelte Dokumente</h2>
        <p className="-mt-1 text-[13px] text-muted">Gleicher Absender, gleiches Briefdatum, ähnlicher Inhalt. Wähle, welches du behältst – die anderen werden gelöscht.</p>
        <DuplicateManager docs={allDocs} />
      </section>
    </div>
  );
}
