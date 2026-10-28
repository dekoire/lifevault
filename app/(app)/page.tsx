"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { CalendarClock, ChevronRight, Search, Sparkles } from "lucide-react";
import { ClusterIcon } from "@/components/ClusterIcon";
import { CARD, DocRow } from "@/components/DocRow";
import { UploadCard } from "@/components/UploadButtons";
import { CLUSTERS } from "@/lib/clusters";
import { fmtDate, useDocs } from "@/lib/docs";

/** Start: Hochladen, Suche, Fristen, Cluster und zuletzt hinzugefügt */
export default function Home() {
  const { docs, loading } = useDocs();
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
  const daysTo = (iso: string) => Math.round((Date.parse(iso) - Date.parse(today)) / 86_400_000);

  return (
    <div className="space-y-5">
      <h1 className="text-[28px] leading-9 font-[650] tracking-tight">Deine Unterlagen</h1>

      <label className="flex h-12 items-center gap-2.5 rounded-full border border-card-line bg-surface px-4 shadow-card focus-within:border-brand-500">
        <Search size={18} className="text-muted" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Suchen: Titel, Absender, Stichwort …" className="h-full min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted" />
      </label>

      {term ? (
        <section className={CARD}>
          <h2 className="px-4 pt-4 pb-2 text-[13px] font-semibold text-muted">{found.length} {found.length === 1 ? "Treffer" : "Treffer"}</h2>
          <div className="divide-y divide-line">{found.map((d) => <DocRow key={d.id} d={d} />)}</div>
          <Link href={`/chat?q=${encodeURIComponent(q)}`} className="flex items-center gap-2 border-t border-line px-4 py-3.5 text-[14px] font-semibold text-selected"><Sparkles size={16} /> „{q}“ im Chat fragen</Link>
        </section>
      ) : (
        <>
          <UploadCard />

          {deadlines.length > 0 && (
            <section className={CARD}>
              <h2 className="flex items-center gap-2 px-4 pt-4 pb-1 text-[17px] font-semibold"><CalendarClock size={18} /> Nächste Fristen</h2>
              <ul className="divide-y divide-line">
                {deadlines.map((x, i) => {
                  const n = daysTo(x.date);
                  return (
                    <li key={i}>
                      <Link href={`/d/${x.d.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2/70">
                        <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl text-center leading-none ${n <= 7 ? "bg-negative/10 text-negative-text" : "bg-surface-3 text-fg"}`}><span><span className="tnum block text-[16px] font-bold">{n}</span><span className="block text-[9px] font-semibold">{n === 1 ? "Tag" : "Tage"}</span></span></span>
                        <span className="min-w-0 flex-1"><span className="block truncate text-[15px] font-semibold">{x.what}</span><span className="block truncate text-[13px] text-muted">{fmtDate(x.date)} · {x.d.title}</span></span>
                        <ChevronRight size={16} className="text-muted" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          <section>
            <h2 className="mb-3 text-[17px] font-semibold">Bereiche</h2>
            {counts.size === 0 && !loading ? (
              <p className={`${CARD} p-5 text-[14px] text-muted`}>Noch nichts abgelegt. Fotografiere ein Dokument oder lade ein PDF hoch – Lifevault sortiert es automatisch in den passenden Bereich.</p>
            ) : (
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                {CLUSTERS.filter((c) => counts.get(c.id)).map((c) => (
                  <Link key={c.id} href={`/c/${c.id}`} className={`${CARD} flex flex-col gap-3 p-4 transition hover:-translate-y-0.5 active:scale-[.98]`}>
                    <ClusterIcon id={c.id} size={40} />
                    <span>
                      <span className="block text-[15px] leading-5 font-semibold">{c.label}</span>
                      <span className="tnum mt-0.5 block text-[13px] text-muted">{counts.get(c.id)} {counts.get(c.id) === 1 ? "Dokument" : "Dokumente"}</span>
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </section>

          {recent.length > 0 && (
            <section className={CARD}>
              <h2 className="px-4 pt-4 pb-1 text-[17px] font-semibold">Zuletzt hinzugefügt</h2>
              <div className="divide-y divide-line">{recent.map((d) => <DocRow key={d.id} d={d} />)}</div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
