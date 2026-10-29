"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Download, FileArchive, FolderDown, Loader2, Trash2 } from "lucide-react";
import { CARD } from "@/components/ui";
import { deleteDownload, listDownloads, saveFile, useJobs, type SavedDownload } from "@/lib/jobs";

const when = (iso: string) => new Date(iso).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
const mb = (n: number) => `${(n / 1_048_576).toFixed(1).replace(".", ",")} MB`;

function useDownloads() {
  const [list, setList] = useState<SavedDownload[]>();
  useEffect(() => {
    const load = () => void listDownloads().then(setList);
    load();
    window.addEventListener("lifevault:downloads", load);
    return () => window.removeEventListener("lifevault:downloads", load);
  }, []);
  return list;
}

/** Laufender Export mit lila Ladebalken */
function Running({ compact = false }: { compact?: boolean }) {
  const running = useJobs().filter((j) => j.kind === "export" && j.state === "running");
  return running.map((j) => (
    <div key={j.id} className={`flex items-center gap-3 ${compact ? "px-3 py-2.5" : "px-5 py-4"}`}>
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-500 text-white"><Loader2 size={17} className="animate-spin" /></span>
      <span className="min-w-0 flex-1">
        <b className="block text-[14px]">Export wird erstellt …</b>
        <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-surface-3"><span className="block h-full rounded-full bg-brand-500 transition-[width]" style={{ width: `${j.total ? Math.max(4, (j.done / j.total) * 100) : 10}%` }} /></span>
      </span>
      <span className="tnum text-[12px] text-muted">{j.done}/{j.total}</span>
    </div>
  ));
}

function Row({ d, compact = false }: { d: SavedDownload; compact?: boolean }) {
  return (
    <div className={`group flex items-center gap-3 ${compact ? "px-3 py-2.5" : "px-5 py-4"} hover:bg-surface-2/60`}>
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-fg text-canvas"><FileArchive size={17} /></span>
      <span className="min-w-0 flex-1">
        <b className="block truncate text-[14px]">{d.name}</b>
        <span className="block truncate text-[12px] text-muted">{when(d.created)} · {d.count} {d.count === 1 ? "Dokument" : "Dokumente"} · {mb(d.size)}</span>
      </span>
      <button type="button" onClick={() => saveFile(d.blob, d.name)} aria-label="Herunterladen" title="Herunterladen" className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface-3 hover:bg-line"><Download size={16} /></button>
      {!compact && <button type="button" onClick={() => void deleteDownload(d.id)} aria-label="Löschen" title="Löschen" className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-negative-text"><Trash2 size={16} /></button>}
    </div>
  );
}

/** Ganze Seite: alle gespeicherten Exporte */
export function DownloadsList() {
  const list = useDownloads();
  return (
    <section className={`${CARD} overflow-hidden`}>
      <div className="divide-y divide-line">
        <Running />
        {list === undefined ? null : list.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-fg text-canvas"><FolderDown size={20} /></span>
            <b className="text-[15px]">Noch keine Downloads</b>
            <span className="max-w-sm text-[13px] text-muted">Starte einen Export auf der Startseite oder in einem Bereich über „Export“. Die ZIP-Dateien erscheinen dann hier.</span>
          </div>
        ) : list.map((d) => <Row key={d.id} d={d} />)}
      </div>
    </section>
  );
}

/** Kopfzeile: Download-Symbol mit den letzten Exporten */
export function DownloadsMenu() {
  const list = useDownloads();
  const running = useJobs().some((j) => j.kind === "export" && j.state === "running");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const off = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", off);
    return () => document.removeEventListener("mousedown", off);
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen(!open)} aria-label="Downloads" title="Downloads" aria-expanded={open} className="relative grid h-10 w-10 place-items-center rounded-full border border-card-line bg-surface text-fg hover:bg-surface-2">
        {running ? <Loader2 size={17} className="animate-spin text-brand-500" /> : <Download size={17} />}
        {!!list?.length && !running && <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-brand-500 ring-2 ring-page" />}
      </button>
      {open && (
        <div className="pop-in absolute top-12 right-0 z-50 w-[22rem] overflow-hidden rounded-2xl border border-card-line bg-surface shadow-[0_16px_40px_rgba(16,24,40,.16)]">
          <div className="flex items-center justify-between px-4 pt-3.5 pb-2"><b className="text-[15px]">Letzte Downloads</b></div>
          <div className="max-h-80 divide-y divide-line overflow-y-auto border-t border-line">
            <Running compact />
            {!list?.length && !running ? <p className="px-4 py-6 text-center text-[13px] text-muted">Noch keine Downloads.</p> : list?.slice(0, 5).map((d) => <Row key={d.id} d={d} compact />)}
          </div>
          <Link href="/downloads" onClick={() => setOpen(false)} className="flex items-center justify-center gap-1.5 border-t border-line bg-surface-2 px-4 py-2.5 text-[13px] font-semibold hover:bg-surface-3">Alle Downloads <ArrowRight size={14} /></Link>
        </div>
      )}
    </div>
  );
}
