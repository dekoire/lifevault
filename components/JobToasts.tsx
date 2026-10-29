"use client";
import { AlertCircle, Check, Download, Loader2, Mail, X } from "lucide-react";
import { dismissJob, listDownloads, saveFile, useJobs } from "@/lib/jobs";

/** Laufende Hintergrund-Aufgaben unten rechts: lila Karte mit Symbol, Text und Ladebalken */
export function JobToasts() {
  const jobs = useJobs();
  if (!jobs.length) return null;
  const again = async (id?: string) => { const d = (await listDownloads()).find((x) => x.id === id); if (d) saveFile(d.blob, d.name); };
  return (
    <div className="pointer-events-none fixed right-4 bottom-24 z-40 flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2 lg:bottom-6">
      {jobs.map((j) => {
        const Icon = j.kind === "mail" ? Mail : Download;
        const pct = j.total ? Math.round((j.done / j.total) * 100) : 0;
        return (
          <div key={j.id} role="status" className="sheet-up pointer-events-auto overflow-hidden rounded-2xl text-white shadow-[0_12px_32px_rgba(85,48,201,.35)]" style={{ background: "linear-gradient(120deg,#5530c9 0%,#6438da 55%,#7650e6 100%)" }}>
            <div className="flex items-center gap-3 px-4 pt-3.5 pb-3">
              <span className="relative grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/15">
                <Icon size={18} />
                <span className="absolute -right-0.5 -bottom-0.5 grid h-4.5 w-4.5 place-items-center rounded-full bg-white text-brand-600">
                  {j.state === "running" ? <Loader2 size={11} className="animate-spin" /> : j.state === "done" ? <Check size={11} strokeWidth={3} /> : <AlertCircle size={11} />}
                </span>
              </span>
              <span className="min-w-0 flex-1">
                <b className="block truncate text-[14px]">{j.title}</b>
                <span className="block truncate text-[12px] text-white/75">{j.state === "running" && j.total ? `${j.done} von ${j.total}` : j.detail}{j.state === "running" && j.total && j.detail ? ` · ${j.detail}` : ""}</span>
              </span>
              {j.kind === "export" && j.state === "done" && <button type="button" onClick={() => void again(j.downloadId)} className="h-8 shrink-0 rounded-full bg-white px-3 text-[12.5px] font-semibold text-brand-600">Laden</button>}
              {j.state !== "running" && <button type="button" onClick={() => dismissJob(j.id)} aria-label="Ausblenden" className="grid h-7 w-7 shrink-0 place-items-center rounded-full hover:bg-white/15"><X size={15} /></button>}
            </div>
            <div className="h-1.5 bg-white/15">
              <div className={`h-full bg-white transition-[width] duration-300 ${j.state === "running" && !j.total ? "w-1/3 animate-pulse" : ""}`} style={j.state !== "running" ? { width: "100%" } : j.total ? { width: `${Math.max(4, pct)}%` } : undefined} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
