"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { AlertCircle, Archive, Building2, CalendarDays, FileText, Hash, LayoutGrid, Lock, Shapes, Users, X } from "lucide-react";
import { ClusterIcon, ClusterTag } from "@/components/ClusterIcon";
import { compare, FilterBar, FilterSelect, IconAvatar, FilterToggle, SortHeader, SortMenu, type Col, type Sort } from "@/components/ListControls";
import { KindAvatar, KindTag } from "@/components/KindTag";
import { SenderLogo } from "@/components/SenderLogo";
import { CARD } from "@/components/ui";
import { clusterOf } from "@/lib/clusters";
import { fmtDate, isUrgent } from "@/lib/docs";
import { KINDS, kindOf } from "@/lib/kinds";
import type { Doc } from "@/lib/types";

type Key = "title" | "cluster" | "sender" | "date";
const dateOf = (d: Doc) => d.doc_date ?? d.received_at.slice(0, 10);

/**
 * Dokumentliste mit sortierbarem Kopf (Dokument, Bereich, Absender, Datum) und Filtern (Suche, Bereich, Absender, Jahr, Archiv).
 * `cluster` blendet Spalte und Filter „Bereich“ aus, wenn die Liste schon nur einen Bereich zeigt; dasselbe gilt für `sender`.
 */
export function DocTable({ docs, cluster = true, sender = true, archiveToggle = true, empty = "Keine Dokumente.", restrict, onClearRestrict, title, limit }: { title?: string; limit?: number; docs: Doc[]; cluster?: boolean; sender?: boolean; archiveToggle?: boolean; empty?: string; restrict?: { label: string; ids: Set<string> } | null; onClearRestrict?: () => void }) {
  // Spalte „Bereich“ nur, wenn die Dokumente aus mehreren Bereichen stammen
  cluster = cluster && new Set(docs.map((d) => clusterOf(d.cluster).id)).size > 1;
  const [sort, setSort] = useState<Sort<Key>>({ key: "date", dir: "desc" });
  const [q, setQ] = useState("");
  const [fCluster, setFCluster] = useState("");
  const [fSender, setFSender] = useState("");
  const [fYear, setFYear] = useState("");
  const [fKind, setFKind] = useState("");
  const [withArchive, setWithArchive] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const cols: Col<Key>[] = [
    { key: "title", label: "Dokument", icon: FileText },
    ...(cluster ? [{ key: "cluster" as const, label: "Bereich", icon: LayoutGrid }] : []),
    ...(sender ? [{ key: "sender" as const, label: "Absender", icon: Building2 }] : []),
    { key: "date", label: "Datum", icon: CalendarDays, className: "justify-end", defaultDir: "desc" },
  ];
  const grid = cluster && sender ? "grid-cols-[minmax(0,1fr)_11rem_12rem_6.5rem] gap-4" : cluster || sender ? "grid-cols-[minmax(0,1fr)_12rem_6.5rem] gap-4" : "grid-cols-[minmax(0,1fr)_6.5rem] gap-4";

  const opts = useMemo(() => {
    const clusters = [...new Set(docs.map((d) => clusterOf(d.cluster).id))].map((id) => ({ value: id, label: clusterOf(id).label, icon: <ClusterIcon id={id} size={30} /> })).sort((a, b) => a.label.localeCompare(b.label, "de"));
    const senders = [...new Set(docs.map((d) => d.sender).filter((s): s is string => !!s))].sort((a, b) => a.localeCompare(b, "de")).map((s) => { const d = docs.find((x) => x.sender === s); return { value: s, label: s, n: docs.filter((x) => x.sender === s).length, icon: <SenderLogo domain={d?.sender_domain} sender={s} cluster={d?.cluster} size={30} /> }; });
    const years = [...new Set(docs.map((d) => dateOf(d).slice(0, 4)))].sort().reverse().map((y) => ({ value: y, label: y, n: docs.filter((d) => dateOf(d).startsWith(y)).length, icon: <IconAvatar text={`’${y.slice(2)}`} /> }));
    const kindN = new Map<string, number>();
    for (const d of docs) kindN.set(kindOf(d).id, (kindN.get(kindOf(d).id) ?? 0) + 1);
    const kinds = KINDS.filter((k) => kindN.get(k.id)).map((k) => ({ value: k.id, label: k.label, n: kindN.get(k.id), icon: <KindAvatar id={k.id} /> }));
    return { clusters, senders, years, kinds };
  }, [docs]);
  const hasArchive = archiveToggle && docs.some((d) => d.archived);

  const term = q.trim().toLowerCase();
  const list = docs
    .filter((d) => !restrict || restrict.ids.has(d.id))
    .filter((d) => withArchive || !archiveToggle || !d.archived)
    .filter((d) => !fCluster || clusterOf(d.cluster).id === fCluster)
    .filter((d) => !fSender || d.sender === fSender)
    .filter((d) => !fYear || dateOf(d).startsWith(fYear))
    .filter((d) => !fKind || kindOf(d).id === fKind)
    .filter((d) => !term || `${d.title ?? ""} ${d.file_name} ${d.sender ?? ""} ${d.doc_type ?? ""} ${(d.tags ?? []).join(" ")}`.toLowerCase().includes(term))
    .sort((a, b) => {
      const v = (d: Doc) => sort.key === "title" ? d.title ?? d.file_name : sort.key === "cluster" ? clusterOf(d.cluster).label : sort.key === "sender" ? d.sender ?? "￿" : dateOf(d);
      return compare(v(a), v(b), sort.dir) || dateOf(b).localeCompare(dateOf(a));
    });
  const filtered = !!(term || fCluster || fSender || fYear || fKind || withArchive);
  const reset = () => { setFCluster(""); setFSender(""); setFYear(""); setFKind(""); setWithArchive(false); };

  // mit Titel: Suche, Filter und Liste in einer Kachel; Anzeige gekürzt, gesucht wird trotzdem in allen
  const shown = limit && !showAll ? list.slice(0, limit) : list;
  const bar = (
    <FilterBar q={q} onQ={setQ} placeholder="In dieser Liste suchen" actions={<SortMenu cols={cols} sort={sort} onSort={setSort} />} activeCount={[fCluster, fSender, fYear, fKind, withArchive].filter(Boolean).length} onReset={reset} count={title ? undefined : `${list.length} ${list.length === 1 ? "Dokument" : "Dokumente"}`}>
      {opts.kinds.length > 1 && <FilterSelect label="Art" icon={Shapes} value={fKind} onChange={setFKind} options={opts.kinds} />}
      {cluster && opts.clusters.length > 1 && <FilterSelect label="Bereich" icon={LayoutGrid} value={fCluster} onChange={setFCluster} options={opts.clusters} />}
      {sender && opts.senders.length > 1 && <FilterSelect label="Absender" icon={Users} value={fSender} onChange={setFSender} options={opts.senders} />}
      {opts.years.length > 1 && <FilterSelect label="Jahr" icon={CalendarDays} value={fYear} onChange={setFYear} options={opts.years} />}
      {hasArchive && <FilterToggle label="Mit Archiv" on={withArchive} onChange={setWithArchive} />}
    </FilterBar>
  );
  const chip = restrict && (
    <div className="flex items-center gap-3 rounded-2xl px-4 py-3 text-white shadow-card" style={{ background: "var(--accent-grad, linear-gradient(120deg,#5530c9 0%,#6438da 55%,#7650e6 100%))" }}>
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-white/15"><Hash size={17} /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-[12px] text-white/75">Gefiltert nach {restrict.label.split(":")[0]} · {list.length} {list.length === 1 ? "Dokument" : "Dokumente"}</span>
        <b className="tnum block truncate text-[15px]">{restrict.label.includes(":") ? restrict.label.split(":").slice(1).join(":").trim() : restrict.label}</b>
      </span>
      <button type="button" onClick={onClearRestrict} aria-label="Kennungs-Filter entfernen" className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full bg-white/15 px-3 text-[13px] font-semibold hover:bg-white/25"><X size={14} /> Alle zeigen</button>
    </div>
  );
  const table = (
    <>
      <SortHeader cols={cols} sort={sort} onSort={setSort} grid={grid} />
      {list.length === 0 ? <p className="px-4 py-6 text-center md:px-6 text-[14px] text-muted">{filtered ? "Nichts gefunden – Filter zurücksetzen?" : empty}</p> : (
        <div className="divide-y divide-line" role="rowgroup">
          {shown.map((d) => <Row key={d.id} d={d} grid={grid} cluster={cluster} sender={sender} />)}
        </div>
      )}
      {limit && list.length > limit && <button type="button" onClick={() => setShowAll(!showAll)} className="w-full border-t border-line bg-surface-2 px-4 py-2.5 text-center text-[13px] font-semibold text-fg transition-colors hover:bg-surface-3">{showAll ? "Weniger anzeigen" : `Alle ${list.length} anzeigen`}</button>}
    </>
  );
  if (title) return (
    <section className={`${CARD} overflow-hidden`}>
      <div className="space-y-3 px-4 pt-5 pb-3 md:px-6">
        <h2 className="flex items-center gap-2 text-[18px] leading-[26px] font-semibold">{title}<span className="tnum rounded-full border border-card-line px-3 py-1 text-[12px] font-semibold text-soft">{list.length}</span></h2>
        {bar}
        {chip}
      </div>
      <div className="border-t border-line" role="table">{table}</div>
    </section>
  );
  return (
    <div className="space-y-3">
      {bar}
      {chip}
      <div className={`${CARD} overflow-hidden`} role="table">{table}</div>
    </div>
  );
}

function Row({ d, grid, cluster, sender }: { d: Doc; grid: string; cluster: boolean; sender: boolean }) {
  const processing = d.status === "processing";
  const title = processing ? d.file_name : d.title ?? d.file_name;
  return (
    <Link href={`/d/${d.id}`} role="row" className={`flex items-center gap-3 px-4 py-3.5 md:px-6 transition-colors hover:bg-canvas md:grid md:items-center ${grid} ${d.archived ? "opacity-60" : ""}`}>
      <span className="flex min-w-0 flex-1 items-center gap-3">
        <SenderLogo domain={d.sender_domain} sender={d.sender} cluster={d.cluster} urgent={isUrgent(d)} size={36} />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-[15px] font-semibold">{title}</span>
            {d.encrypted && <Lock size={13} className="shrink-0 text-brand-500" aria-label="verschlüsselt" />}
            {d.archived && <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-card-line px-3 py-1 text-[12px] font-semibold text-soft"><Archive size={11} /> Archiv</span>}
          </span>
          <span className="flex min-w-0 items-center gap-1.5 text-[13px] text-muted md:hidden">
            {processing ? <span className="text-shimmer font-medium">Wird ausgelesen</span> : d.status === "error" ? <span className="inline-flex items-center gap-1 text-negative-text"><AlertCircle size={13} /> {d.error ?? "Fehler"}</span> : (
              <><KindTag d={d} />{cluster && <><ClusterTag id={d.cluster} className="shrink-0 text-soft" /><span>·</span></>}<span className="truncate">{[sender ? d.sender : null, fmtDate(dateOf(d))].filter(Boolean).join(" · ")}</span></>
            )}
          </span>
          {d.status === "ready" && <span className="hidden min-w-0 items-center gap-1.5 text-[13px] text-muted md:flex"><KindTag d={d} />{d.doc_type && <span className="truncate">{d.doc_type}</span>}</span>}
        </span>
      </span>
      {cluster && <span className="hidden min-w-0 text-[14px] text-soft md:block"><ClusterTag id={d.cluster} /></span>}
      {sender && <span className="hidden truncate text-[14px] text-soft md:block">{d.sender ?? "–"}</span>}
      <span className="tnum hidden text-right text-[14px] text-soft md:block">{fmtDate(dateOf(d))}</span>
    </Link>
  );
}
