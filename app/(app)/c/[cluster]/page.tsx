"use client";
import Link from "next/link";
import { use } from "react";
import { ChevronLeft } from "lucide-react";
import { ClusterIcon } from "@/components/ClusterIcon";
import { CARD, DocRow } from "@/components/DocRow";
import { clusterOf } from "@/lib/clusters";
import { useDocs } from "@/lib/docs";

/** Ein Bereich: alle Dokumente nach Jahr, neueste zuerst (Dokumentdatum, sonst Eingang) */
export default function ClusterPage({ params }: { params: Promise<{ cluster: string }> }) {
  const { cluster } = use(params);
  const c = clusterOf(cluster);
  const { docs } = useDocs();
  const list = docs.filter((d) => d.cluster === c.id).sort((a, b) => (b.doc_date ?? b.received_at).localeCompare(a.doc_date ?? a.received_at));
  const years = [...new Set(list.map((d) => (d.doc_date ?? d.received_at).slice(0, 4)))];
  return (
    <div className="space-y-5">
      <Link href="/" className="inline-flex h-10 items-center gap-1 rounded-full pr-3 pl-1.5 text-[14px] font-semibold text-soft hover:bg-surface-3"><ChevronLeft size={18} /> Start</Link>
      <div className="flex items-center gap-3">
        <ClusterIcon id={c.id} size={48} />
        <div>
          <h1 className="text-[24px] leading-8 font-[650] tracking-tight">{c.label}</h1>
          <p className="text-[13px] text-muted">{list.length} {list.length === 1 ? "Dokument" : "Dokumente"} · {c.hint}</p>
        </div>
      </div>
      {years.map((y) => (
        <section key={y} className={CARD}>
          <h2 className="px-4 pt-4 pb-1 text-[13px] font-semibold text-muted">{y}</h2>
          <div className="divide-y divide-line">{list.filter((d) => (d.doc_date ?? d.received_at).startsWith(y)).map((d) => <DocRow key={d.id} d={d} />)}</div>
        </section>
      ))}
    </div>
  );
}
