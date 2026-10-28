"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";
import { CalendarClock, ChevronDown, ChevronLeft, ExternalLink, MessageSquare, RefreshCw, Trash2 } from "lucide-react";
import { ClusterIcon } from "@/components/ClusterIcon";
import { CARD } from "@/components/DocRow";
import { clusterOf } from "@/lib/clusters";
import { fmtDate, fmtMoney, useDocs } from "@/lib/docs";
import { supabase } from "@/lib/supabase";
import type { Doc } from "@/lib/types";

/** Ein Dokument: Original, Zusammenfassung, Key-Fakten, Fristen, Beträge, Schlagworte und Volltext */
export default function DocPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { docs, reprocess, remove } = useDocs();
  const listed = docs.find((d) => d.id === id);
  const [doc, setDoc] = useState<Doc>();
  const [url, setUrl] = useState<string>();
  const [showText, setShowText] = useState(false);
  // Volltext erst hier laden; neu laden, sobald das Auslesen fertig ist
  useEffect(() => {
    void supabase.from("documents").select("*").eq("id", id).maybeSingle().then(({ data }) => setDoc((data as Doc) ?? undefined));
  }, [id, listed?.status]);
  useEffect(() => {
    if (!doc) return;
    void supabase.storage.from("documents").createSignedUrl(doc.file_path, 600).then(({ data }) => setUrl(data?.signedUrl));
  }, [doc?.file_path]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!doc) return <p className="py-20 text-center text-muted">Lädt …</p>;
  const c = clusterOf(doc.cluster);
  const image = doc.mime_type.startsWith("image/");
  const del = async () => {
    if (!confirm("Dokument endgültig löschen?")) return;
    await remove(doc);
    router.replace("/");
  };
  return (
    <div className="space-y-4">
      <button type="button" onClick={() => router.back()} className="inline-flex h-10 items-center gap-1 rounded-full pr-3 pl-1.5 text-[14px] font-semibold text-soft hover:bg-surface-3"><ChevronLeft size={18} /> Zurück</button>
      <div className="flex items-start gap-3">
        <ClusterIcon id={doc.cluster} size={48} />
        <div className="min-w-0">
          <h1 className="text-[22px] leading-7 font-[650] tracking-tight">{doc.title ?? doc.file_name}</h1>
          <p className="mt-1 text-[13px] text-muted">{[doc.doc_type, doc.sender, fmtDate(doc.doc_date)].filter(Boolean).join(" · ")}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Link href={`/c/${c.id}`} className="inline-flex h-7 items-center rounded-full px-2.5 text-[12px] font-semibold" style={{ color: c.color, background: `color-mix(in srgb, ${c.color} 12%, transparent)` }}>{c.label}</Link>
            <span className="inline-flex h-7 items-center rounded-full bg-surface-3 px-2.5 text-[12px] font-medium text-soft">Eingang {fmtDate(doc.received_at)}</span>
          </div>
        </div>
      </div>

      {doc.status === "processing" && <p className={`${CARD} flex items-center gap-2.5 p-4 text-[14px]`}><span className="flex gap-1">{[0, 1, 2].map((i) => <span key={i} className="typing-dot h-1.5 w-1.5 rounded-full bg-brand-500" style={{ animationDelay: `${i * 0.15}s` }} />)}</span><span className="text-shimmer font-medium">Wird ausgelesen und sortiert …</span></p>}
      {doc.status === "error" && <p className="rounded-2xl bg-negative/10 p-4 text-[14px] text-negative-text">{doc.error}</p>}

      {doc.summary && <section className={`${CARD} p-4`}><p className="text-[15px] leading-6">{doc.summary}</p></section>}

      {doc.deadlines?.length > 0 && (
        <section className={CARD}>
          <h2 className="flex items-center gap-2 px-4 pt-4 pb-1 text-[15px] font-semibold"><CalendarClock size={16} /> Fristen & Termine</h2>
          <ul className="divide-y divide-line">{doc.deadlines.map((x, i) => <li key={i} className="flex justify-between gap-3 px-4 py-2.5 text-[14px]"><span>{x.what}</span><span className="tnum shrink-0 font-semibold">{fmtDate(x.date)}</span></li>)}</ul>
        </section>
      )}

      {doc.key_facts?.length > 0 && (
        <section className={CARD}>
          <h2 className="px-4 pt-4 pb-1 text-[15px] font-semibold">Key-Fakten</h2>
          <dl className="divide-y divide-line">{doc.key_facts.map((f, i) => <div key={i} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-3 px-4 py-2.5 text-[14px]"><dt className="text-muted">{f.label}</dt><dd className="font-medium break-words">{f.value}</dd></div>)}</dl>
        </section>
      )}

      {doc.amounts?.length > 0 && (
        <section className={CARD}>
          <h2 className="px-4 pt-4 pb-1 text-[15px] font-semibold">Beträge</h2>
          <ul className="divide-y divide-line">{doc.amounts.map((a, i) => <li key={i} className="flex justify-between gap-3 px-4 py-2.5 text-[14px]"><span className="text-muted">{a.label}</span><span className="tnum font-semibold">{fmtMoney(a.value, a.currency)}</span></li>)}</ul>
        </section>
      )}

      {doc.tags?.length > 0 && <div className="flex flex-wrap gap-1.5">{doc.tags.map((t) => <span key={t} className="rounded-full border border-card-line bg-surface px-3 py-1 text-[12px] font-medium text-soft">{t}</span>)}</div>}

      <section className={`${CARD} overflow-hidden`}>
        <div className="flex items-center justify-between px-4 pt-4 pb-3">
          <h2 className="text-[15px] font-semibold">Original</h2>
          {url && <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[13px] font-semibold text-selected">Öffnen <ExternalLink size={14} /></a>}
        </div>
        {url && image && <img src={url} alt={doc.title ?? doc.file_name} className="max-h-[70vh] w-full bg-surface-2 object-contain" />}
        {url && !image && <p className="px-4 pb-4 text-[13px] text-muted">{doc.file_name} · {(doc.size_bytes / 1024 / 1024).toFixed(1)} MB</p>}
      </section>

      {doc.full_text && (
        <section className={CARD}>
          <button type="button" onClick={() => setShowText(!showText)} aria-expanded={showText} className="flex w-full items-center justify-between px-4 py-4 text-[15px] font-semibold">Vollständiger Text <ChevronDown size={18} className={`transition ${showText ? "rotate-180" : ""}`} /></button>
          {showText && <pre className="border-t border-line px-4 py-4 font-sans text-[13px] leading-6 whitespace-pre-wrap text-soft">{doc.full_text}</pre>}
        </section>
      )}

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Link href={`/chat?q=${encodeURIComponent(`Erklär mir „${doc.title ?? doc.file_name}“: Was ist wichtig, was muss ich tun?`)}`} className="flex h-12 items-center justify-center gap-2 rounded-full bg-brand-500 text-[14px] font-semibold text-white"><MessageSquare size={17} /> Dazu fragen</Link>
        <button type="button" onClick={() => void reprocess(doc.id)} className="flex h-12 items-center justify-center gap-2 rounded-full bg-surface-3 text-[14px] font-semibold"><RefreshCw size={16} /> Neu auslesen</button>
        <button type="button" onClick={() => void del()} className="flex h-12 items-center justify-center gap-2 rounded-full bg-surface-3 text-[14px] font-semibold text-negative-text"><Trash2 size={16} /> Löschen</button>
      </div>
    </div>
  );
}
