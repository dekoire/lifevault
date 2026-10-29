"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { AlertCircle, Archive, Lock } from "lucide-react";
import { ClusterTag } from "@/components/ClusterIcon";
import { compare, FilterBar, FilterSelect, FilterToggle, SortHeader, type Col, type Sort } from "@/components/ListControls";
import { SenderLogo } from "@/components/SenderLogo";
import { CARD } from "@/components/ui";
import { clusterOf } from "@/lib/clusters";
import { fmtDate, isUrgent } from "@/lib/docs";
import type { Doc } from "@/lib/types";

type Key = "title" | "cluster" | "sender" | "date";
const dateOf = (d: Doc) => d.doc_date ?? d.received_at.slice(0, 10);

/**
 * Dokumentliste mit sortierbarem Kopf (Dokument, Bereich, Absender, Datum) und Filtern (Suche, Bereich, Absender, Jahr, Archiv).
 * `cluster` blendet Spalte und Filter „Bereich“ aus, wenn die Liste schon nur einen Bereich zeigt; dasselbe gilt für `sender`.
 */
export function DocTable({ docs, cluster = true, sender = true, archiveToggle = true, empty = "Keine Dokumente." }: { docs: Doc[]; cluster?: boolean; sender?: boolean; archiveToggle?: boolean; empty?: string }) {
  const [sort, setSort] = useState<Sort<Key>>({ key: "date", dir: "desc" });
  const [q, setQ] = useState("");
  const [fCluster, setFCluster] = useState("");
  const [fSender, setFSender] = useState("");
  const [fYear, setFYear] = useState("");
  const [withArchive, setWithArchive] = useState(false);

  const cols: Col<Key>[] = [
    { key: "title", label: "Dokument" },
    ...(cluster ? [{ key: "cluster" as const, label: "Bereich" }] : []),
    ...(sender ? [{ key: "sender" as const, label: "Absender" }] : []),
    { key: "date", label: "Datum", className: "justify-end", defaultDir: "desc" },
  ];
  const grid = cluster && sender ? "grid-cols-[minmax(0,1fr)_11rem_12rem_6.5rem] gap-4" : cluster || sender ? "grid-cols-[minmax(0,1fr)_12rem_6.5rem] gap-4" : "grid-cols-[minmax(0,1fr)_6.5rem] gap-4";

  const opts = useMemo(() => {
    const clusters = [...new Set(docs.map((d) => clusterOf(d.cluster).id))].map((id) => ({ value: id, label: clusterOf(id).label })).sort((a, b) => a.label.localeCompare(b.label, "de"));
    const senders = [...new Set(docs.map((d) => d.sender).filter((s): s is string => !!s))].sort((a, b) => a.localeCompare(b, "de")).map((s) => ({ value: s, label: s }));
    const years = [...new Set(docs.map((d) => dateOf(d).slice(0, 4)))].sort().reverse().map((y) => ({ value: y, label: y }));
    return { clusters, senders, years };
  }, [docs]);
  const hasArchive = archiveToggle && docs.some((d) => d.archived);

  const term = q.trim().toLowerCase();
  const list = docs
    .filter((d) => withArchive || !archiveToggle || !d.archived)
    .filter((d) => !fCluster || clusterOf(d.cluster).id === fCluster)
    .filter((d) => !fSender || d.sender === fSender)
    .filter((d) => !fYear || dateOf(d).startsWith(fYear))
    .filter((d) => !term || `${d.title ?? ""} ${d.file_name} ${d.sender ?? ""} ${d.doc_type ?? ""} ${(d.tags ?? []).join(" ")}`.toLowerCase().includes(term))
    .sort((a, b) => {
      const v = (d: Doc) => sort.key === "title" ? d.title ?? d.file_name : sort.key === "cluster" ? clusterOf(d.cluster).label : sort.key === "sender" ? d.sender ?? "￿" : dateOf(d);
      return compare(v(a), v(b), sort.dir) || dateOf(b).localeCompare(dateOf(a));
    });
  const filtered = !!(term || fCluster || fSender || fYear || withArchive);
  const reset = () => { setQ(""); setFCluster(""); setFSender(""); setFYear(""); setWithArchive(false); };

  return (
    <div className="space-y-3">
      <FilterBar q={q} onQ={setQ} placeholder="In dieser Liste suchen" active={filtered} onReset={reset} count={`${list.length} ${list.length === 1 ? "Dokument" : "Dokumente"}`}>
        {cluster && opts.clusters.length > 1 && <FilterSelect label="Bereich" value={fCluster} onChange={setFCluster} options={opts.clusters} />}
        {sender && opts.senders.length > 1 && <FilterSelect label="Absender" value={fSender} onChange={setFSender} options={opts.senders} />}
        {opts.years.length > 1 && <FilterSelect label="Jahr" value={fYear} onChange={setFYear} options={opts.years} />}
        {hasArchive && <FilterToggle label="Mit Archiv" on={withArchive} onChange={setWithArchive} />}
      </FilterBar>
      <div className={`${CARD} overflow-hidden`} role="table">
        <SortHeader cols={cols} sort={sort} onSort={setSort} grid={grid} />
        {list.length === 0 ? <p className="px-4 py-6 text-center text-[14px] text-muted">{filtered ? "Nichts gefunden – Filter zurücksetzen?" : empty}</p> : (
          <div className="divide-y divide-line" role="rowgroup">
            {list.map((d) => <Row key={d.id} d={d} grid={grid} cluster={cluster} sender={sender} />)}
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ d, grid, cluster, sender }: { d: Doc; grid: string; cluster: boolean; sender: boolean }) {
  const processing = d.status === "processing";
  const title = processing ? d.file_name : d.title ?? d.file_name;
  return (
    <Link href={`/d/${d.id}`} role="row" className={`flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2/70 md:grid md:items-center ${grid} ${d.archived ? "opacity-60" : ""}`}>
      <span className="flex min-w-0 flex-1 items-center gap-3">
        <SenderLogo domain={d.sender_domain} sender={d.sender} cluster={d.cluster} urgent={isUrgent(d)} size={36} />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-[14.5px] font-semibold">{title}</span>
            {d.encrypted && <Lock size={13} className="shrink-0 text-brand-500" aria-label="verschlüsselt" />}
            {d.archived && <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-card-line px-1.5 py-px text-[11px] font-semibold text-soft"><Archive size={11} /> Archiv</span>}
          </span>
          <span className="flex min-w-0 items-center gap-1.5 text-[12.5px] text-muted md:hidden">
            {processing ? <span className="text-shimmer font-medium">Wird ausgelesen</span> : d.status === "error" ? <span className="inline-flex items-center gap-1 text-negative-text"><AlertCircle size={13} /> {d.error ?? "Fehler"}</span> : (
              <>{cluster && <><ClusterTag id={d.cluster} className="shrink-0 text-soft" /><span>·</span></>}<span className="truncate">{[sender ? d.sender : null, fmtDate(dateOf(d))].filter(Boolean).join(" · ")}</span></>
            )}
          </span>
          {d.doc_type && <span className="hidden truncate text-[12.5px] text-muted md:block">{d.doc_type}</span>}
        </span>
      </span>
      {cluster && <span className="hidden min-w-0 text-[13.5px] text-soft md:block"><ClusterTag id={d.cluster} /></span>}
      {sender && <span className="hidden truncate text-[13.5px] text-soft md:block">{d.sender ?? "–"}</span>}
      <span className="tnum hidden text-right text-[13.5px] text-soft md:block">{fmtDate(dateOf(d))}</span>
    </Link>
  );
}
