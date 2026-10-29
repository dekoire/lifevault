"use client";
import { DuplicateManager } from "@/components/Duplicates";
import { BackLink, PageHeader } from "@/components/ui";
import { useDocs } from "@/lib/docs";

/** Doppelt abgelegte Dokumente prüfen und zusammenführen */
export default function DoppeltPage() {
  const { allDocs } = useDocs();
  return (
    <div className="max-w-3xl">
      <BackLink href="/" label="Start" />
      <PageHeader title="Doppelte Dokumente" subtitle="Gleicher Absender, gleiches Briefdatum, ähnlicher Inhalt. Wähle, welches du behältst – die anderen werden gelöscht." />
      <DuplicateManager docs={allDocs} />
    </div>
  );
}
