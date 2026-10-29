"use client";
import { useEdgeFade } from "@/lib/edgefade";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CalendarClock, ChevronRight, FileText, Layers, ListChecks, Lock, Search, Sparkles } from "lucide-react";
import { ClusterIcon } from "@/components/ClusterIcon";
import { CARD, DocRow } from "@/components/DocRow";
import { TodoList } from "@/components/TodoList";
import { MergeSuggestions } from "@/components/MergeSuggestions";
import { CardWallet } from "@/components/CardWallet";
import { RecentTable } from "@/components/RecentTable";
import { DuplicateHint } from "@/components/Duplicates";
import { todos, todoKind } from "@/lib/actions";
import { PageHeader } from "@/components/ui";
import { SenderLogo } from "@/components/SenderLogo";
import { buildPartners } from "@/lib/partners";
import { useProjects } from "@/lib/projects";
import { CLUSTERS } from "@/lib/clusters";
import { fmtDate, useDocs } from "@/lib/docs";

/** Start: Hochladen, Suche, Fristen, Cluster und zuletzt hinzugefügt */
/** Kacheln auf der Startseite: weiß mit feinem Rahmen und Schatten */
const TILE = CARD;

export default function Home() {
  const { docs, loading, pendingProtect } = useDocs();
  const { currentProject } = useProjects();
  const partners = useMemo(() => buildPartners(docs), [docs]);
  const [q, setQ] = useState("");
  const partnerRow = useEdgeFade<HTMLDivElement>();
  const today = new Date().toISOString().slice(0, 10);
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of docs) if (d.status === "ready" && d.cluster) m.set(d.cluster, (m.get(d.cluster) ?? 0) + 1);
    return m;
  }, [docs]);
  const open = useMemo(() => todos(docs, today), [docs, today]);
  const term = q.trim().toLowerCase();
  const found = term ? docs.filter((d) => [d.title, d.file_name, d.sender, d.summary, d.doc_type, ...(d.tags ?? []), ...(d.labels ?? []), ...(d.key_facts ?? []).map((f) => `${f.label} ${f.value}`)].some((v) => v?.toLowerCase().includes(term))) : [];
  const recent = docs.slice(0, 8);
  const ready = docs.filter((d) => d.status === "ready");
  const month = today.slice(0, 7);
  const kpis = [
    { icon: FileText, value: ready.length, label: "Dokumente", sub: `+${docs.filter((d) => d.received_at.startsWith(month)).length} diesen Monat` },
    { icon: Layers, value: counts.size, label: "Bereiche", sub: `von ${CLUSTERS.length}` },
    { icon: ListChecks, value: ready.reduce((a, d) => a + (d.key_facts?.length ?? 0), 0), label: "Key-Fakten", sub: "herausgeschrieben" },
    { icon: CalendarClock, value: open.length, label: "Zu erledigen", sub: open.some((t) => t.days < 0 && todoKind(t) === "zahlung") ? `${open.filter((t) => t.days < 0 && todoKind(t) === "zahlung").length} Zahlungen überfällig` : "stehen an" },
  ];

  const archived = docs.filter((d) => d.archived).length;
  // rechte Spalte nur, wenn Dokumente auf Verschlüsselung warten
  const side = pendingProtect > 0;

  return (
    <div>
      <PageHeader title={currentProject?.name ?? "Deine Unterlagen"} subtitle={loading ? " " : `${ready.length} Dokumente in ${counts.size} Bereichen${archived ? ` · ${archived} archiviert` : ""}`} />
      <div className={`grid grid-cols-1 gap-5 lg:items-start ${side ? "lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_400px]" : ""}`}>
        <div className="stagger min-w-0 space-y-5">
          {/* Kennzahlen: was bisher gesammelt ist */}
          <section className="relative grid grid-cols-2 overflow-hidden rounded-2xl text-white shadow-card sm:grid-cols-4 [&>div:nth-of-type(odd)]:border-r [&>div:nth-of-type(-n+2)]:border-b sm:[&>div]:border-b-0 max-sm:[&>div:nth-of-type(even)]:border-r-0 sm:[&>div:not(:last-of-type)]:border-r" style={{ background: "var(--accent-grad, linear-gradient(120deg,#5530c9 0%,#6438da 55%,#7650e6 100%))" }}>
            {/* dezenter Glanz wie bei Finastry */}
            <span aria-hidden className="pointer-events-none absolute -top-24 -right-16 h-56 w-56 rounded-full bg-white/10 blur-2xl" />
            {kpis.map(({ icon: Icon, value, label, sub }) => (
              <div key={label} className="relative border-white/15 p-4">
                <span className="flex items-center gap-1.5 text-[12px] font-medium text-white/75"><Icon size={14} /> {label}</span>
                <span className="tnum mt-1 block text-[26px] leading-8 font-[650] tracking-tight">{loading ? "–" : <CountUp value={value} />}</span>
                <span className="block text-[12px] text-white/70">{sub}</span>
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
              {partners.length > 0 && (
                <section>
                  <div className="mb-3 flex items-center justify-between"><h2 className="text-[17px] font-semibold">Deine Partner</h2><Link href="/partner" className="text-[13px] font-semibold text-selected">Alle {partners.length}</Link></div>
                  <div ref={partnerRow} className="fade-x -mx-4 flex gap-3 overflow-x-auto px-4 pt-1 pb-2 [scrollbar-width:none] md:mx-0 md:px-0">
                    {partners.slice(0, 12).map((p) => (
                      <Link key={p.key} href={`/partner/${p.key}`} title={p.name} className={`${TILE} flex w-[128px] shrink-0 flex-col items-center gap-2.5 px-3 pt-4 pb-3 text-center ${p.active ? "" : "opacity-60"}`}>
                        <SenderLogo domain={p.domain} sender={p.name} cluster={p.cluster} size={52} bare />
                        <span className="w-full min-w-0">
                          <span className="block truncate text-[13px] leading-5 font-semibold">{p.name}</span>
                          <span className="block text-[11.5px] text-muted">{p.docs.length} {p.docs.length === 1 ? "Dokument" : "Dokumente"}</span>
                        </span>
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
                      <Link key={c.id} href={`/c/${c.id}`} className={`${TILE} flex flex-col gap-3 p-4 ${n ? "" : "opacity-60"}`}>
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
              <DuplicateHint docs={docs} />
              <MergeSuggestions />
              <CardWallet title="Wichtige Karten" compact />
              <TodoList docs={docs} />
              {recent.length > 0 && (
                <section className={`${CARD} overflow-hidden`}>
                  <h2 className="px-4 pt-4 pb-3 text-[16px] font-semibold">Zuletzt hinzugefügt</h2>
                  <RecentTable docs={recent} />
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
        </aside>}
      </div>
    </div>
  );
}

/** Zahl beim Laden kurz hochzählen (ca. 0,6 s, abbremsend) */
function CountUp({ value }: { value: number }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setN(value); return; }
    let raf = 0;
    const start = performance.now();
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / 600);
      setN(Math.round(value * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{n.toLocaleString("de-DE")}</>;
}
