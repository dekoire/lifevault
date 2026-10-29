"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { CalendarClock, ChevronRight, FileText, Layers, ListChecks, Lock, Search, Sparkles } from "lucide-react";
import { ClusterIcon } from "@/components/ClusterIcon";
import { CARD, DocRow } from "@/components/DocRow";
import { PageHeader } from "@/components/ui";
import { SenderLogo } from "@/components/SenderLogo";
import { buildPartners } from "@/lib/partners";
import { useProjects } from "@/lib/projects";
import { CLUSTERS } from "@/lib/clusters";
import { fmtDate, useDocs } from "@/lib/docs";

/** Start: Hochladen, Suche, Fristen, Cluster und zuletzt hinzugefügt */
export default function Home() {
  const { docs, loading, pendingProtect } = useDocs();
  const { currentProject } = useProjects();
  const partners = useMemo(() => buildPartners(docs), [docs]);
  const [q, setQ] = useState("");
  const today = new Date().toISOString().slice(0, 10);
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of docs) if (d.status === "ready" && d.cluster) m.set(d.cluster, (m.get(d.cluster) ?? 0) + 1);
    return m;
  }, [docs]);
  const deadlines = useMemo(() => docs.flatMap((d) => (d.deadlines ?? []).filter((x) => x.date >= today).map((x) => ({ ...x, d }))).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 5), [docs, today]);
  const term = q.trim().toLowerCase();
  const found = term ? docs.filter((d) => [d.title, d.file_name, d.sender, d.summary, d.doc_type, ...(d.tags ?? []), ...(d.key_facts ?? []).map((f) => `${f.label} ${f.value}`)].some((v) => v?.toLowerCase().includes(term))) : [];
  const recent = docs.slice(0, 8);
  const ready = docs.filter((d) => d.status === "ready");
  const month = today.slice(0, 7);
  const kpis = [
    { icon: FileText, value: ready.length, label: "Dokumente", sub: `+${docs.filter((d) => d.received_at.startsWith(month)).length} diesen Monat` },
    { icon: Layers, value: counts.size, label: "Bereiche", sub: `von ${CLUSTERS.length}` },
    { icon: ListChecks, value: ready.reduce((a, d) => a + (d.key_facts?.length ?? 0), 0), label: "Key-Fakten", sub: "herausgeschrieben" },
    { icon: CalendarClock, value: docs.reduce((a, d) => a + (d.deadlines ?? []).filter((x) => x.date >= today).length, 0), label: "Fristen", sub: "stehen an" },
  ];
  const daysTo = (iso: string) => Math.round((Date.parse(iso) - Date.parse(today)) / 86_400_000);

  const archived = docs.filter((d) => d.archived).length;
  // rechte Spalte nur, wenn es etwas Wichtiges gibt (Fristen, Verschlüsselung)
  const side = deadlines.length > 0 || pendingProtect > 0;
  const deadlineCard = deadlines.length > 0 && (
    <section className={CARD}>
      <h2 className="flex items-center gap-2 px-4 pt-4 pb-1 text-[16px] font-semibold"><CalendarClock size={18} /> Nächste Fristen</h2>
      <ul className="divide-y divide-line">
        {deadlines.map((x, i) => {
          const n = daysTo(x.date);
          return (
            <li key={i}>
              <Link href={`/d/${x.d.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2/70">
                <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-full text-center leading-none ${n <= 7 ? "bg-urgent text-white" : "bg-fg text-canvas"}`}><span><span className="tnum block text-[15px] font-bold">{n}</span><span className="block text-[9px] font-semibold">{n === 1 ? "Tag" : "Tage"}</span></span></span>
                <span className="min-w-0 flex-1"><span className="block truncate text-[14px] font-semibold">{x.what}</span><span className="block truncate text-[12px] text-muted">{fmtDate(x.date)} · {x.d.title}</span></span>
                <ChevronRight size={16} className="text-muted" />
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );

  return (
    <div>
      <PageHeader title={currentProject?.name ?? "Deine Unterlagen"} subtitle={loading ? " " : `${ready.length} Dokumente in ${counts.size} Bereichen${archived ? ` · ${archived} archiviert` : ""}`} />
      <div className={`grid grid-cols-1 gap-5 lg:items-start ${side ? "lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_400px]" : ""}`}>
        <div className="min-w-0 space-y-5">
          {/* Kennzahlen: was bisher gesammelt ist */}
          <section className={`${CARD} grid grid-cols-2 sm:grid-cols-4 [&>*:nth-child(odd)]:border-r [&>*:nth-child(-n+2)]:border-b sm:[&>*]:border-b-0 sm:[&>*:not(:last-child)]:border-r`}>
            {kpis.map(({ icon: Icon, value, label, sub }) => (
              <div key={label} className="border-line p-4">
                <span className="flex items-center gap-1.5 text-[12px] font-medium text-muted"><Icon size={14} /> {label}</span>
                <span className="tnum mt-1 block text-[26px] leading-8 font-[650] tracking-tight text-brand-500">{loading ? "–" : value.toLocaleString("de-DE")}</span>
                <span className="block text-[12px] text-muted">{sub}</span>
              </div>
            ))}
          </section>


          {term ? (
            <section className={CARD}>
              <h2 className="px-4 pt-4 pb-2 text-[13px] font-semibold text-muted">{found.length} Treffer</h2>
              <div className="divide-y divide-line">{found.map((d) => <DocRow key={d.id} d={d} />)}</div>
              <Link href={`/chat?q=${encodeURIComponent(q)}`} className="flex items-center gap-2 border-t border-line px-4 py-3.5 text-[14px] font-semibold text-selected"><Sparkles size={16} /> „{q}“ im Chat fragen</Link>
            </section>
          ) : (
            <>
              <div className="lg:hidden">{deadlineCard}</div>
              {partners.length > 0 && (
                <section>
                  <div className="mb-3 flex items-center justify-between"><h2 className="text-[17px] font-semibold">Deine Partner</h2><Link href="/partner" className="text-[13px] font-semibold text-selected">Alle {partners.length}</Link></div>
                  <div className="-mx-4 flex gap-2.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:mx-0 md:px-0">
                    {partners.slice(0, 12).map((p) => (
                      <Link key={p.key} href={`/partner/${p.key}`} className={`${CARD} flex w-[104px] shrink-0 flex-col items-center gap-2 p-3 text-center ${p.active ? "" : "opacity-60"}`}>
                        <SenderLogo domain={p.domain} sender={p.name} cluster={p.cluster} size={44} />
                        <span className="line-clamp-2 text-[12px] leading-4 font-semibold">{p.name}</span>
                      </Link>
                    ))}
                  </div>
                </section>
              )}
              <section>
                <h2 className="mb-3 text-[17px] font-semibold">Bereiche</h2>
                {counts.size === 0 && !loading && <p className="mb-3 text-[14px] text-muted">Noch nichts abgelegt. Fotografiere ein Dokument oder lade ein PDF hoch – Lifevault sortiert es automatisch in einen dieser Bereiche.</p>}
                {/* alle Bereiche: belegte zuerst, leere blass mit Beschreibung, was hineingehört */}
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                  {[...CLUSTERS].sort((a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0)).map((c) => {
                    const n = counts.get(c.id) ?? 0;
                    return (
                      <Link key={c.id} href={`/c/${c.id}`} className={`${CARD} flex flex-col gap-3 p-4 transition hover:border-brand-500/40 active:scale-[.98] ${n ? "" : "opacity-60"}`}>
                        <span className="flex items-start justify-between gap-2"><ClusterIcon id={c.id} size={40} tone="plain" /><span className={`tnum inline-grid h-7 min-w-7 place-items-center rounded-full px-2 text-[12px] font-bold ${n ? "border border-card-line bg-surface-2 text-fg" : "border border-card-line text-muted"}`}>{n}</span></span>
                        <span>
                          <span className="block text-[15px] leading-5 font-semibold">{c.label}</span>
                          <span className="mt-0.5 line-clamp-2 block text-[12px] leading-4 text-muted">{c.hint}</span>
                        </span>
                      </Link>
                    );
                  })}
                </div>
              </section>
              {recent.length > 0 && (
                <section className={CARD}>
                  <h2 className="px-4 pt-4 pb-1 text-[16px] font-semibold">Zuletzt hinzugefügt</h2>
                  <div className="divide-y divide-line">{recent.map((d) => <DocRow key={d.id} d={d} />)}</div>
                </section>
              )}
            </>
          )}
        </div>

        {/* Desktop: rechte Spalte mit Fristen, Hinweisen und Profil */}
        {side && <aside className="hidden space-y-5 lg:sticky lg:top-6 lg:block">
          {pendingProtect > 0 && (
            <Link href="/einstellungen/tresor" className={`${CARD} flex items-center gap-3 p-4`}>
              <span className="grid h-10 w-10 place-items-center rounded-full bg-fg text-canvas"><Lock size={18} /></span>
              <span className="text-[13px]"><b className="block text-[14px]">{pendingProtect} warten auf Verschlüsselung</b><span className="text-muted">Tresor entsperren, dann werden sie geschützt.</span></span>
            </Link>
          )}
          {deadlineCard}
        </aside>}
      </div>
    </div>
  );
}
