"use client";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Search, Sparkles, X } from "lucide-react";
import { ClusterIcon } from "@/components/ClusterIcon";
import { useDetail } from "@/components/DetailPanel";
import { SenderLogo } from "@/components/SenderLogo";
import { CLUSTERS } from "@/lib/clusters";
import { fmtDate, useDocs } from "@/lib/docs";
import { buildPartners } from "@/lib/partners";

type Hit = { key: string; icon: React.ReactNode; title: string; sub: string; go: () => void };

/** Suche oben (Strg/⌘+K): Dokumente, Partner, Bereiche – und „im Chat fragen“ */
export function GlobalSearch({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const detail = useDetail();
  const { docs } = useDocs();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen(true); setTimeout(() => input.current?.focus(), 0); }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  useEffect(() => {
    if (!open || compact) return;
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open, compact]);

  const term = q.trim().toLowerCase();
  const hits = useMemo<Hit[]>(() => {
    if (!term) return [];
    const done = (fn: () => void) => () => { setOpen(false); setQ(""); fn(); };
    const ds = docs.filter((d) => [d.title, d.file_name, d.sender, d.doc_type, d.summary, ...(d.tags ?? []), ...(d.key_facts ?? []).map((f) => `${f.label} ${f.value}`)].some((v) => v?.toLowerCase().includes(term))).slice(0, 7)
      .map((d) => ({ key: `d${d.id}`, icon: <SenderLogo domain={d.sender_domain} sender={d.sender} cluster={d.cluster} size={32} />, title: d.title ?? d.file_name, sub: [d.sender, fmtDate(d.doc_date ?? d.received_at)].filter(Boolean).join(" · "), go: done(() => (detail ? detail({ kind: "doc", id: d.id }) : router.push(`/d/${d.id}`))) }));
    const ps = buildPartners(docs).filter((p) => p.name.toLowerCase().includes(term) || p.ids.some((i) => i.value.toLowerCase().includes(term))).slice(0, 4)
      .map((p) => ({ key: `p${p.key}`, icon: <SenderLogo domain={p.domain} sender={p.name} cluster={p.cluster} size={32} />, title: p.name, sub: `Partner · ${p.docs.length} Dokumente`, go: done(() => (detail ? detail({ kind: "partner", key: p.key }) : router.push(`/partner/${p.key}`))) }));
    const cs = CLUSTERS.filter((c) => c.label.toLowerCase().includes(term)).slice(0, 3)
      .map((c) => ({ key: `c${c.id}`, icon: <ClusterIcon id={c.id} size={32} />, title: c.label, sub: "Bereich", go: done(() => router.push(`/c/${c.id}`)) }));
    const ask = { key: "ask", icon: <span className="grid h-8 w-8 place-items-center rounded-full bg-brand-500 text-white"><Sparkles size={15} /></span>, title: `„${q.trim()}“ im Chat fragen`, sub: "Antwort aus deinen Unterlagen", go: done(() => router.push(`/chat?q=${encodeURIComponent(q.trim())}`)) };
    return [...ds, ...ps, ...cs, ask];
  }, [term, q, docs, detail, router]);
  useEffect(() => setSel(0), [term]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(hits.length - 1, s + 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
    if (e.key === "Enter" && hits[sel]) { e.preventDefault(); hits[sel].go(); }
    if (e.key === "Escape") { setOpen(false); input.current?.blur(); }
  };

  const results = open && term && (
    <ul role="listbox" className="max-h-[60vh] overflow-y-auto p-1.5">
      {hits.map((h, i) => (
        <li key={h.key}>
          <button type="button" role="option" aria-selected={i === sel} onMouseEnter={() => setSel(i)} onClick={h.go} className={`flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left ${i === sel ? "bg-surface-2" : ""}`}>
            {h.icon}
            <span className="min-w-0 flex-1"><b className="block truncate text-[14px]">{h.title}</b><span className="block truncate text-[12px] text-muted">{h.sub}</span></span>
          </button>
        </li>
      ))}
    </ul>
  );

  const field = (
    <label className="flex h-10 w-full items-center gap-2 rounded-full border border-card-line bg-surface px-3.5 focus-within:border-brand-500">
      <Search size={16} className="shrink-0 text-muted" />
      <input ref={input} value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onKeyDown={onKey} placeholder="Suchen: Dokument, Firma, Nummer …" aria-label="Suchen" className="h-full min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-muted" />
      {q ? <button type="button" onClick={() => setQ("")} aria-label="Leeren" className="text-muted"><X size={15} /></button> : !compact && <kbd className="rounded-md border border-card-line px-1.5 text-[11px] text-muted">Strg K</kbd>}
    </label>
  );

  if (compact) return (
    <>
      <button type="button" onClick={() => { setOpen(true); setTimeout(() => input.current?.focus(), 50); }} aria-label="Suchen" className="grid h-10 w-10 place-items-center rounded-full bg-surface-3 text-soft"><Search size={18} /></button>
      {open && (
        <div className="fixed inset-0 z-50 bg-black/40" onClick={() => setOpen(false)}>
          <div className="sheet-up pt-safe bg-page px-3 pb-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 pt-3">{field}<button type="button" onClick={() => setOpen(false)} className="shrink-0 px-2 text-[14px] font-semibold">Fertig</button></div>
            {results && <div className="mt-2 rounded-2xl border border-card-line bg-surface">{results}</div>}
          </div>
        </div>
      )}
    </>
  );
  return (
    <div ref={box} className="relative w-full max-w-xl">
      {field}
      {results && <div className="sheet-up absolute top-full right-0 left-0 z-50 mt-2 rounded-2xl border border-card-line bg-surface shadow-[0_12px_32px_rgba(16,24,40,.14)]">{results}</div>}
    </div>
  );
}
