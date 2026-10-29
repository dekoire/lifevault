"use client";
import { useEffect, useState } from "react";
import { Download, FileArchive, Trash2 } from "lucide-react";
import { CARD } from "@/components/ui";
import { deleteDownload, listDownloads, saveFile, useJobs, type SavedDownload } from "@/lib/jobs";

/** Letzte Exporte (nur in diesem Browser gespeichert, die letzten 5) */
export function DownloadsSettings() {
  const [list, setList] = useState<SavedDownload[]>();
  const running = useJobs().filter((j) => j.kind === "export" && j.state === "running");
  useEffect(() => {
    const load = () => void listDownloads().then(setList);
    load();
    window.addEventListener("lifevault:downloads", load);
    return () => window.removeEventListener("lifevault:downloads", load);
  }, []);
  const when = (iso: string) => new Date(iso).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  return (
    <section className={`${CARD} overflow-hidden`}>
      <p className="px-5 pt-4 pb-3 text-[13.5px] text-soft">Exporte startest du auf der Startseite oder in einem Bereich über „Export“. Die letzten 5 bleiben hier in diesem Browser gespeichert.</p>
      <div className="divide-y divide-line border-t border-line">
        {running.map((j) => (
          <div key={j.id} className="flex items-center gap-3 px-5 py-3.5">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-500 text-white"><FileArchive size={18} /></span>
            <span className="min-w-0 flex-1">
              <b className="block text-[14.5px]">Wird erstellt …</b>
              <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-surface-3"><span className="block h-full rounded-full bg-brand-500 transition-[width]" style={{ width: `${j.total ? Math.max(4, (j.done / j.total) * 100) : 10}%` }} /></span>
            </span>
            <span className="tnum text-[12.5px] text-muted">{j.done} / {j.total}</span>
          </div>
        ))}
        {list === undefined ? null : list.length === 0 && !running.length ? <p className="px-5 py-6 text-center text-[14px] text-muted">Noch keine Exporte.</p> : list.map((d) => (
          <div key={d.id} className="flex items-center gap-3 px-5 py-3.5">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-fg text-canvas"><FileArchive size={18} /></span>
            <span className="min-w-0 flex-1">
              <b className="block truncate text-[14.5px]">{d.name}</b>
              <span className="block text-[12.5px] text-muted">{when(d.created)} · {d.count} {d.count === 1 ? "Dokument" : "Dokumente"} · {(d.size / 1_048_576).toFixed(1).replace(".", ",")} MB</span>
            </span>
            <button type="button" onClick={() => saveFile(d.blob, d.name)} aria-label="Erneut herunterladen" title="Erneut herunterladen" className="grid h-9 w-9 place-items-center rounded-full bg-surface-3 hover:bg-line"><Download size={16} /></button>
            <button type="button" onClick={() => void deleteDownload(d.id)} aria-label="Löschen" title="Löschen" className="grid h-9 w-9 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-negative-text"><Trash2 size={16} /></button>
          </div>
        ))}
      </div>
    </section>
  );
}
