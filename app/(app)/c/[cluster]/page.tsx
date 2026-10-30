"use client";
import { use, useState } from "react";
import { Archive, GalleryHorizontal, List } from "lucide-react";
import { GroupedDocs } from "@/components/GroupedDocs";
import { ClusterIcon } from "@/components/ClusterIcon";
import { CARD, DocRow } from "@/components/DocRow";
import { BackLink, PageHeader, Segmented } from "@/components/ui";
import { clusterOf } from "@/lib/clusters";
import { useDocs } from "@/lib/docs";

/** Ein Bereich: aktuelle Dokumente nach Jahr, neueste zuerst (Dokumentdatum, sonst Eingang); Archiv darunter */
export default function ClusterPage({ params }: { params: Promise<{ cluster: string }> }) {
  const { cluster } = use(params);
  const c = clusterOf(cluster);
  const { docs } = useDocs();
  const [showArchive, setShowArchive] = useState(false);
  const [view, setView] = useState<"cards" | "list">("list");
  const all = docs.filter((d) => d.cluster === c.id).sort((a, b) => (b.doc_date ?? b.received_at).localeCompare(a.doc_date ?? a.received_at));
  const list = all.filter((d) => !d.archived);
  const archived = all.filter((d) => d.archived);
  return (
    <div className="space-y-5">
      {/* Zurück und Ansicht in einer Zeile – spart oben eine Zeile */}
      <BackLink href="/" label="Start" aside={list.length > 0 && <Segmented value={view} onChange={setView} options={[{ id: "cards", label: "Karten", icon: <GalleryHorizontal size={15} /> }, { id: "list", label: "Liste", icon: <List size={15} /> }]} />} />
      <PageHeader icon={<ClusterIcon id={c.id} size={52} />} title={c.label} subtitle={`${list.length} ${list.length === 1 ? "Dokument" : "Dokumente"} · ${c.hint}`} />
      <GroupedDocs cluster={c.id} view={view} />
      {archived.length > 0 && (
        <section className={CARD}>
          <button type="button" onClick={() => setShowArchive(!showArchive)} aria-expanded={showArchive} className="flex w-full items-center gap-2 px-4 py-3.5 text-left text-[14px] font-semibold text-soft"><Archive size={16} /> Archiv · {archived.length} nicht mehr aktuell <span className="ml-auto text-[13px] text-selected">{showArchive ? "ausblenden" : "anzeigen"}</span></button>
          {showArchive && <div className="divide-y divide-line border-t border-line">{archived.map((d) => <DocRow key={d.id} d={d} />)}</div>}
        </section>
      )}
    </div>
  );
}
