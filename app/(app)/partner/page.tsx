"use client";
import Link from "next/link";
import { Building2, CalendarDays, FileSignature, FileText, Hash, LayoutGrid, Shapes, ShoppingBag } from "lucide-react";
import { useMemo, useState } from "react";
import { ClusterIcon, ClusterTag } from "@/components/ClusterIcon";
import { compare, FilterBar, FilterSelect, IconAvatar, FilterToggle, SortHeader, SortMenu, type Col, type Sort } from "@/components/ListControls";
import { SenderLogo } from "@/components/SenderLogo";
import { CARD, PageHeader } from "@/components/ui";
import { clusterOf } from "@/lib/clusters";
import { fmtDate, useDocs } from "@/lib/docs";
import { buildPartners, type Partner } from "@/lib/partners";
import { useHistoryLinks } from "@/lib/history";

type Key = "name" | "cluster" | "docs" | "ids" | "last";
const COLS: Col<Key>[] = [
  { key: "name", label: "Partner", icon: Building2 },
  { key: "cluster", label: "Bereich", icon: LayoutGrid },
  { key: "docs", label: "Dokumente", icon: FileText, className: "justify-end", defaultDir: "desc" },
  { key: "ids", label: "Kennungen", icon: Hash, className: "justify-end", defaultDir: "desc" },
  { key: "last", label: "Zuletzt", icon: CalendarDays, className: "justify-end", defaultDir: "desc" },
];
const GRID = "grid-cols-[minmax(0,1fr)_11rem_7.5rem_7.5rem_6.5rem] gap-4";
const KINDS = [{ value: "vertrag", label: "Verträge & Dienstleister", icon: <IconAvatar icon={FileSignature} /> }, { value: "shop", label: "Händler & Einkäufe", icon: <IconAvatar icon={ShoppingBag} /> }];
const kindOf = (p: Partner) => (p.isShop ? "shop" : "vertrag");

/** Alle Vertragspartner, Dienstleister und Händler aus deinen Dokumenten – sortier- und filterbar */
export default function PartnersPage() {
  const { docs, loading } = useDocs();
  const { byPartner } = useHistoryLinks(docs);
  // Verlauf: Partner, die abgelöst wurden (anderer Arzt, Übergabe, neuer Arbeitgeber), gelten als „früher“
  const all = useMemo(() => buildPartners(docs).map((p) => (byPartner.get(p.key)?.entry.status === "früher" ? { ...p, active: false } : p)), [docs, byPartner]);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort<Key>>({ key: "name", dir: "asc" });
  const [fCluster, setFCluster] = useState("");
  const [fKind, setFKind] = useState("");
  const [onlyIds, setOnlyIds] = useState(false);
  const [withFormer, setWithFormer] = useState(false);

  const clusters = useMemo(() => [...new Set(all.map((p) => clusterOf(p.cluster).id))].map((id) => ({ value: id, label: clusterOf(id).label, n: all.filter((p) => clusterOf(p.cluster).id === id).length, icon: <ClusterIcon id={id} size={30} /> })).sort((a, b) => a.label.localeCompare(b.label, "de")), [all]);
  const hasFormer = all.some((p) => !p.active);
  const term = q.trim().toLowerCase();
  const list = all
    .filter((p) => withFormer || p.active)
    .filter((p) => !fCluster || clusterOf(p.cluster).id === fCluster)
    .filter((p) => !fKind || kindOf(p) === fKind)
    .filter((p) => !onlyIds || p.ids.length > 0)
    .filter((p) => !term || p.name.toLowerCase().includes(term) || p.ids.some((i) => `${i.label} ${i.value}`.toLowerCase().includes(term)))
    .sort((a, b) => {
      const v = (p: Partner): string | number => sort.key === "name" ? p.name : sort.key === "cluster" ? clusterOf(p.cluster).label : sort.key === "docs" ? p.docs.length : sort.key === "ids" ? p.ids.length : p.last;
      return compare(v(a), v(b), sort.dir) || b.last.localeCompare(a.last);
    });
  const filtered = !!(term || fCluster || fKind || onlyIds || withFormer);
  const reset = () => { setFCluster(""); setFKind(""); setOnlyIds(false); setWithFormer(false); };

  return (
    <>
      <PageHeader title="Partner" subtitle={loading ? " " : `${all.length} Firmen und Stellen aus deinen Unterlagen – mit allen Kunden-, Vertrags- und Versicherungsnummern`} />
      <div className="space-y-3">
        <FilterBar q={q} onQ={setQ} placeholder="Suchen: Firma oder Nummer, z. B. O2 oder Kundennummer" actions={<SortMenu cols={COLS} sort={sort} onSort={setSort} />} activeCount={[fCluster, fKind, onlyIds, withFormer].filter(Boolean).length} onReset={reset} count={`${list.length} von ${all.length}`}>
          {clusters.length > 1 && <FilterSelect label="Bereich" icon={LayoutGrid} value={fCluster} onChange={setFCluster} options={clusters} />}
          <FilterSelect label="Art" icon={Shapes} value={fKind} onChange={setFKind} options={KINDS} />
          <FilterToggle label="Mit Kennungen" on={onlyIds} onChange={setOnlyIds} />
          {hasFormer && <FilterToggle label="Auch frühere" on={withFormer} onChange={setWithFormer} />}
        </FilterBar>
        {all.length > 0 && (
          <div className={`${CARD} overflow-hidden`} role="table">
            <SortHeader cols={COLS} sort={sort} onSort={setSort} grid={GRID} />
            {list.length === 0 ? <p className="px-4 py-6 text-center text-[14px] text-muted">Nichts gefunden – Filter zurücksetzen?</p> : (
              <div className="divide-y divide-line" role="rowgroup">
                {list.map((p) => (
                  <Link key={p.key} href={`/partner/${p.key}`} role="row" className={`flex items-center gap-3 px-4 py-3 hover:bg-surface-2/70 md:grid ${GRID} ${p.active ? "" : "opacity-60"}`}>
                    <span className="flex min-w-0 flex-1 items-center gap-3">
                      <SenderLogo domain={p.domain} sender={p.name} cluster={p.cluster} size={38} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <b className="truncate text-[14.5px]">{p.name}</b>
                          {p.isShop && <span className="shrink-0 rounded-full border border-card-line px-1.5 py-px text-[11px] font-semibold text-soft">Händler</span>}
                          {!p.active && <span className="shrink-0 rounded-full border border-card-line px-1.5 py-px text-[11px] font-semibold text-soft">früher</span>}
                          {byPartner.get(p.key)?.entry.status === "aktuell" && byPartner.get(p.key)?.prev && <span className="shrink-0 rounded-full bg-positive/10 px-1.5 py-px text-[11px] font-semibold text-positive-text">aktuell · {byPartner.get(p.key)!.role}</span>}
                        </span>
                        {!p.active && (byPartner.get(p.key)?.next ?? byPartner.get(p.key)?.current) && <span className="hidden truncate text-[12.5px] text-muted md:block">abgelöst durch {(byPartner.get(p.key)!.next ?? byPartner.get(p.key)!.current)!.name}</span>}
                        <span className="flex min-w-0 items-center gap-1.5 text-[12.5px] text-muted md:hidden">
                          <ClusterTag id={p.cluster} className="shrink-0 text-soft" /><span>·</span>
                          <span className="truncate">{!p.active && (byPartner.get(p.key)?.next ?? byPartner.get(p.key)?.current) ? `→ ${(byPartner.get(p.key)!.next ?? byPartner.get(p.key)!.current)!.name} · ` : ""}{p.docs.length} Dok.{p.ids.length ? ` · ${p.ids.length} Kenn.` : ""} · {fmtDate(p.last)}</span>
                        </span>
                      </span>
                    </span>
                    <span className="hidden min-w-0 text-[13.5px] text-soft md:block"><ClusterTag id={p.cluster} /></span>
                    <span className="tnum hidden text-right text-[13.5px] text-soft md:block">{p.docs.length}</span>
                    <span className="tnum hidden text-right text-[13.5px] text-soft md:block">{p.ids.length || "–"}</span>
                    <span className="tnum hidden text-right text-[13.5px] text-soft md:block">{fmtDate(p.last)}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}
        {!loading && !all.length && <p className="text-[14px] text-muted">Noch keine Partner. Sobald Dokumente ausgelesen sind, erscheinen hier Absender, Vertragspartner und Händler.</p>}
      </div>
    </>
  );
}
