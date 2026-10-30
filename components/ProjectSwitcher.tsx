"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Check, ChevronsUpDown, Layers, Plus, Settings2 } from "lucide-react";
import { useDocs } from "@/lib/docs";
import { useProjects } from "@/lib/projects";

export const Dot = ({ color, size = 10 }: { color: string; size?: number }) => <span aria-hidden className="inline-block shrink-0 rounded-full" style={{ width: size, height: size, background: color }} />;

/** Projekt wählen: „Alle Projekte“ oder ein einzelnes – gilt für Start, Bereiche, Suche und Hochladen */
export function ProjectSwitcher({ compact = false }: { compact?: boolean }) {
  const { projects, current, setCurrent, currentProject } = useProjects();
  const { allDocs } = useDocs();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  const count = (id?: string) => allDocs.filter((d) => !id || d.project_id === id).length;
  const label = currentProject?.name ?? "Alle Projekte";
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="listbox"
        className={compact ? "flex h-10 max-w-[11rem] items-center gap-2 rounded-full border border-card-line bg-surface/80 px-3 text-[13px] font-semibold shadow-[0_8px_30px_rgba(15,23,42,.07)] backdrop-blur-xl transition-colors hover:bg-surface-2" : "flex h-11 w-full items-center gap-2 rounded-xl border border-card-line bg-surface px-3 text-left shadow-[0_8px_30px_rgba(15,23,42,.07)] transition-colors hover:bg-surface-2"}>
        {currentProject ? <Dot color={currentProject.color} size={8} /> : <Layers size={14} className="text-muted" />}
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{label}</span>
        <ChevronsUpDown size={14} className="shrink-0 text-muted" />
      </button>
      {open && (
        <div role="listbox" className={`pop-in absolute z-50 mt-1.5 w-64 rounded-2xl border border-card-line bg-surface p-1.5 shadow-[0_12px_32px_rgba(16,24,40,.14)] left-0`}>
          {[{ id: "all", name: "Alle Projekte", color: "" }, ...projects].map((p) => (
            <button key={p.id} type="button" role="option" aria-selected={current === p.id} onClick={() => { setCurrent(p.id); setOpen(false); }}
              className="flex h-9 w-full items-center gap-2.5 rounded-xl px-2.5 text-left text-[14px] hover:bg-surface-2">
              {p.id === "all" ? <Layers size={15} className="text-muted" /> : <Dot color={p.color} />}
              <span className="min-w-0 flex-1 truncate font-medium">{p.name}</span>
              <span className="tnum text-[12px] text-muted">{count(p.id === "all" ? undefined : p.id)}</span>
              {current === p.id && <Check size={15} className="text-selected" />}
            </button>
          ))}
          <div className="my-1 h-px bg-line" />
          <Link href="/einstellungen/projekte?neu=1" onClick={() => setOpen(false)} className="flex h-10 items-center gap-2.5 rounded-xl px-2.5 text-[14px] font-medium hover:bg-surface-2"><Plus size={15} /> Neues Projekt</Link>
          <Link href="/einstellungen/projekte" onClick={() => setOpen(false)} className="flex h-10 items-center gap-2.5 rounded-xl px-2.5 text-[14px] font-medium hover:bg-surface-2"><Settings2 size={15} /> Projekte verwalten</Link>
        </div>
      )}
    </div>
  );
}

/** Auswahl, in welches Projekt hochgeladen wird */
export function UploadTarget() {
  const { projects, current, setCurrent, defaultProject } = useProjects();
  if (projects.length < 2) return null;
  return (
    <label className="mb-3 flex items-center gap-2 rounded-full bg-surface-2 py-1.5 pr-2 pl-4 text-[13px] text-soft">
      Ablegen in
      <select value={current === "all" ? defaultProject?.id ?? "" : current} onChange={(e) => setCurrent(e.target.value)} className="h-8 min-w-0 flex-1 rounded-full border border-card-line bg-surface px-3 text-[14px] font-semibold text-fg">
        {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
    </label>
  );
}
